using Dapper;
using ELCS.API.Data;
using ELCS.API.DTOs;
using ELCS.API.Models;
using System.Text.Json;

namespace ELCS.API.Services;

public class ExtractionService : IExtractionService
{
    private readonly ILogger<ExtractionService> _logger;
    private readonly IDbConnection _db;
    private readonly IOcrService _ocrService;
    private readonly IOpenAIService _openAIService;
    private readonly ISpeechService? _speechService;

    public ExtractionService(
        ILogger<ExtractionService> logger,
        IDbConnection db,
        IOcrService ocrService,
        IOpenAIService openAIService,
        ISpeechService? speechService = null)
    {
        _logger = logger;
        _db = db;
        _ocrService = ocrService;
        _openAIService = openAIService;
        _speechService = speechService;
    }

    public async Task<CardExtractionResponse> ExtractCardAsync(
        Stream frontImage,
        Stream? backImage,
        string frontFileName,
        string? backFileName,
        int exhibitionId,
        int employeeId)
    {
        using var conn = _db.CreateConnection();

        // Create lead first
        var leadId = await conn.ExecuteScalarAsync<int>(@"
            INSERT INTO Leads (ExhibitionId, SourceCode, StatusCode, AssignedEmployeeId, CreatedAt)
            OUTPUT INSERTED.LeadId
            VALUES (@ExhibitionId, 'employee_scan', 'new', @EmployeeId, GETUTCDATE())",
            new { ExhibitionId = exhibitionId, EmployeeId = employeeId });

        _logger.LogInformation("Created lead {LeadId} for card extraction", leadId);

        try
        {
            // OCR directly from streams — no disk I/O
            _logger.LogInformation("Starting OCR for lead {LeadId}", leadId);
            var frontOcrResult = await _ocrService.ExtractTextAsync(frontImage);

            OcrResult? backOcrResult = null;
            if (backImage != null)
                backOcrResult = await _ocrService.ExtractTextAsync(backImage);

            var allPhones = frontOcrResult.DetectedPhones
                .Concat(backOcrResult?.DetectedPhones ?? Enumerable.Empty<string>())
                .Distinct()
                .ToList();

            // Normalize with OpenAI
            _logger.LogInformation("Normalizing card data with OpenAI for lead {LeadId}", leadId);
            var extractionData = await _openAIService.NormalizeCardDataAsync(
                frontOcrResult.Text,
                backOcrResult?.Text,
                allPhones);

            // Check for duplicates
            var duplicateCheck = await CheckForDuplicates(conn, extractionData, exhibitionId);

            // Segment lead
            var primaryPerson = extractionData.Persons.FirstOrDefault();
            var segmentInfo = SegmentLead(primaryPerson?.Designation);

            // Update lead with extracted data
            await UpdateLeadWithExtraction(conn, leadId, extractionData, segmentInfo);
            await SaveLeadEntities(conn, leadId, extractionData);
            await AddSystemMessage(conn, leadId,
                $"Card scanned. Confidence: {extractionData.Confidence:P0} | Segment: {segmentInfo.Segment} (Priority {segmentInfo.Priority})",
                employeeId);

            _logger.LogInformation("Card extraction completed for lead {LeadId}", leadId);

            return new CardExtractionResponse(
                Success: true,
                LeadId: leadId,
                Extraction: extractionData,
                Segment: segmentInfo.Segment,
                Priority: segmentInfo.Priority,
                DuplicateCheck: duplicateCheck,
                Message: "Card extracted successfully."
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Card extraction failed for lead {LeadId}", leadId);
            throw;
        }
    }

    public async Task<VoiceExtractionResponse> ExtractVoiceAsync(
        Stream audioStream,
        string fileName,
        int? leadId,
        int employeeId)
    {
        try
        {
            using var conn = _db.CreateConnection();

            if (_speechService == null)
            {
                return new VoiceExtractionResponse(
                    Success: false,
                    LeadId: leadId,
                    Transcript: null,
                    Summary: null,
                    Topics: null,
                    Segment: null,
                    Priority: null,
                    InterestLevel: null,
                    Confidence: 0,
                    RequiresConfirmation: false,
                    Error: "Speech service not configured."
                );
            }

            // Transcribe directly from stream — no disk I/O
            _logger.LogInformation("Transcribing audio (leadId={LeadId})", leadId);
            var transcript = await _speechService.TranscribeAudioAsync(audioStream, fileName);

            if (string.IsNullOrWhiteSpace(transcript))
            {
                return new VoiceExtractionResponse(
                    Success: false,
                    LeadId: leadId,
                    Transcript: null,
                    Summary: null,
                    Topics: null,
                    Segment: null,
                    Priority: null,
                    InterestLevel: null,
                    Confidence: 0,
                    RequiresConfirmation: false,
                    Error: "No speech detected in audio."
                );
            }

            // Analyze transcript with OpenAI
            _logger.LogInformation("Analyzing voice transcript with OpenAI (leadId={LeadId})", leadId);
            var analysis = await _openAIService.AnalyzeVoiceTranscriptAsync(transcript);

            // If no leadId provided, extract lead name from analysis and search for matches
            int? resolvedLeadId = leadId;
            string? extractedLeadName = null;
            List<PossibleLead>? possibleLeads = null;

            if (!leadId.HasValue)
            {
                extractedLeadName = analysis.LeadName;

                if (!string.IsNullOrWhiteSpace(extractedLeadName))
                {
                    var matchingLeads = await conn.QueryAsync<(int LeadId, string Name, string? CompanyName, string? Phone)>(@"
                        SELECT TOP 10
                            LeadId,
                            PrimaryVisitorName as Name,
                            CompanyName,
                            PrimaryVisitorPhone as Phone
                        FROM Leads
                        WHERE PrimaryVisitorName LIKE '%' + @Name + '%'
                          AND AssignedEmployeeId = @EmployeeId
                        ORDER BY CreatedAt DESC",
                        new { Name = extractedLeadName, EmployeeId = employeeId });

                    var matchingLeadsList = matchingLeads.ToList();

                    if (matchingLeadsList.Count == 1)
                    {
                        resolvedLeadId = matchingLeadsList[0].LeadId;
                        _logger.LogInformation("Auto-matched lead: {LeadId} ({Name})", resolvedLeadId, matchingLeadsList[0].Name);
                    }
                    else if (matchingLeadsList.Count > 1)
                    {
                        possibleLeads = matchingLeadsList
                            .Select(l => new PossibleLead(l.LeadId, l.Name, l.CompanyName, l.Phone))
                            .ToList();
                        _logger.LogInformation("Found {Count} possible matches for '{Name}'", possibleLeads.Count, extractedLeadName);
                    }
                    else
                    {
                        _logger.LogWarning("No leads found matching '{Name}'", extractedLeadName);
                    }
                }
                else
                {
                    _logger.LogWarning("Could not extract lead name from transcript");
                }
            }

            if (!resolvedLeadId.HasValue)
            {
                return new VoiceExtractionResponse(
                    Success: true,
                    LeadId: null,
                    Transcript: analysis.Transcript,
                    Summary: analysis.Summary,
                    Topics: analysis.Topics,
                    Segment: analysis.Segment,
                    Priority: analysis.Priority,
                    InterestLevel: analysis.InterestLevel,
                    Confidence: analysis.Confidence,
                    RequiresConfirmation: true,
                    ExtractedLeadName: extractedLeadName,
                    PossibleLeads: possibleLeads,
                    Error: possibleLeads?.Count > 0
                        ? $"Multiple leads found matching '{extractedLeadName}'. Please select one."
                        : $"No lead found matching '{extractedLeadName}'. Please select or create a lead."
                );
            }

            // Update lead with analysis results
            await conn.ExecuteAsync(@"
                UPDATE Leads SET
                    DiscussionSummary = @Summary,
                    Segment = @Segment,
                    Priority = @Priority,
                    UpdatedAt = GETUTCDATE()
                WHERE LeadId = @LeadId",
                new
                {
                    LeadId = resolvedLeadId.Value,
                    Summary = analysis.Summary,
                    Segment = analysis.Segment,
                    Priority = analysis.Priority
                });

            await AddSystemMessage(conn, resolvedLeadId.Value,
                $"🎤 Voice note analyzed:\n\n" +
                $"Transcript: {analysis.Transcript}\n\n" +
                $"Summary: {analysis.Summary}\n\n" +
                $"Topics: {string.Join(", ", analysis.Topics)}\n\n" +
                $"Segment: {analysis.Segment} | Priority: {analysis.Priority} | Interest: {analysis.InterestLevel}",
                employeeId);

            _logger.LogInformation(
                "Voice extraction completed for lead {LeadId}. Summary: '{Summary}'",
                resolvedLeadId.Value, analysis.Summary);

            return new VoiceExtractionResponse(
                Success: true,
                LeadId: resolvedLeadId.Value,
                Transcript: analysis.Transcript,
                Summary: analysis.Summary,
                Topics: analysis.Topics,
                Segment: analysis.Segment,
                Priority: analysis.Priority,
                InterestLevel: analysis.InterestLevel,
                Confidence: analysis.Confidence,
                RequiresConfirmation: false,
                ExtractedLeadName: extractedLeadName,
                PossibleLeads: null,
                Error: null
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Voice extraction failed (leadId={LeadId})", leadId);
            return new VoiceExtractionResponse(
                Success: false,
                LeadId: leadId,
                Transcript: null,
                Summary: null,
                Topics: null,
                Segment: null,
                Priority: null,
                InterestLevel: null,
                Confidence: 0,
                RequiresConfirmation: false,
                Error: ex.Message
            );
        }
    }

    /// <summary>
    /// Extract card data WITHOUT creating a lead — returns data for user confirmation
    /// </summary>
    public async Task<CardExtractionResponse> ExtractCardPreviewAsync(
        Stream frontImage,
        Stream? backImage,
        string frontFileName,
        string? backFileName,
        int exhibitionId)
    {
        using var conn = _db.CreateConnection();

        try
        {
            // OCR directly from streams — no disk I/O
            _logger.LogInformation("Starting OCR preview extraction");
            var frontOcrResult = await _ocrService.ExtractTextAsync(frontImage);

            OcrResult? backOcrResult = null;
            if (backImage != null)
                backOcrResult = await _ocrService.ExtractTextAsync(backImage);

            var allPhones = frontOcrResult.DetectedPhones
                .Concat(backOcrResult?.DetectedPhones ?? Enumerable.Empty<string>())
                .Distinct()
                .ToList();

            // Normalize with OpenAI
            _logger.LogInformation("Normalizing card data with OpenAI (preview mode)");
            var extractionData = await _openAIService.NormalizeCardDataAsync(
                frontOcrResult.Text,
                backOcrResult?.Text,
                allPhones);

            var duplicateCheck = await CheckForDuplicates(conn, extractionData, exhibitionId);
            var primaryPerson = extractionData.Persons.FirstOrDefault();
            var segmentInfo = SegmentLead(primaryPerson?.Designation);

            _logger.LogInformation("Card preview extraction completed");

            return new CardExtractionResponse(
                Success: true,
                LeadId: 0,
                Extraction: extractionData,
                Segment: segmentInfo.Segment,
                Priority: segmentInfo.Priority,
                DuplicateCheck: duplicateCheck,
                Message: "Card extracted successfully. Please review and confirm to save."
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Card preview extraction failed");
            throw;
        }
    }

    /// <summary>
    /// Confirm and save lead from preview extraction data
    /// </summary>
    public async Task<CardExtractionResponse> ConfirmAndSaveLeadAsync(
        CardExtractionData extractionData,
        int exhibitionId,
        int employeeId)
    {
        using var conn = _db.CreateConnection();

        // Create lead
        var leadId = await conn.ExecuteScalarAsync<int>(@"
            INSERT INTO Leads (ExhibitionId, SourceCode, StatusCode, AssignedEmployeeId, CreatedAt)
            OUTPUT INSERTED.LeadId
            VALUES (@ExhibitionId, 'employee_scan', 'new', @EmployeeId, GETUTCDATE())",
            new { ExhibitionId = exhibitionId, EmployeeId = employeeId });

        _logger.LogInformation("Created confirmed lead {LeadId}", leadId);

        try
        {
            var primaryPerson = extractionData.Persons.FirstOrDefault();
            var segmentInfo = SegmentLead(primaryPerson?.Designation);

            await UpdateLeadWithExtraction(conn, leadId, extractionData, segmentInfo);
            await SaveLeadEntities(conn, leadId, extractionData);
            await AddSystemMessage(conn, leadId,
                $"Card scanned and confirmed. Confidence: {extractionData.Confidence:P0} | Segment: {segmentInfo.Segment} (Priority {segmentInfo.Priority})",
                employeeId);

            _logger.LogInformation("Lead {LeadId} confirmed and saved successfully", leadId);

            return new CardExtractionResponse(
                Success: true,
                LeadId: leadId,
                Extraction: extractionData,
                Segment: segmentInfo.Segment,
                Priority: segmentInfo.Priority,
                DuplicateCheck: null,
                Message: "Lead saved successfully."
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save confirmed lead {LeadId}", leadId);
            throw;
        }
    }

    // ─── Private helpers ───────────────────────────────────────────────────────

    private async Task<DuplicateCheckResult> CheckForDuplicates(Microsoft.Data.SqlClient.SqlConnection conn, CardExtractionData data, int exhibitionId)
    {
        var primaryPerson = data.Persons.FirstOrDefault();
        var duplicates = new List<DuplicateInfo>();

        var allPhones = data.Phones.Where(p => !string.IsNullOrWhiteSpace(p))
            .Concat(primaryPerson?.Phones ?? Enumerable.Empty<string>())
            .Distinct()
            .ToList();

        var allEmails = data.Emails.Where(e => !string.IsNullOrWhiteSpace(e))
            .Concat(primaryPerson?.Emails ?? Enumerable.Empty<string>())
            .Distinct()
            .ToList();

        var primaryName = primaryPerson?.Name;
        var companyName = data.CompanyName;

        _logger.LogInformation("Checking duplicates in exhibition {ExhibitionId}", exhibitionId);

        var tenDigits = new List<string>();
        foreach (var phone in allPhones)
        {
            if (!string.IsNullOrWhiteSpace(phone))
            {
                var normalizedPhone = NormalizePhoneNumber(phone);
                var tenDigit = normalizedPhone.Length == 12 && normalizedPhone.StartsWith("91")
                    ? normalizedPhone.Substring(2)
                    : normalizedPhone;
                tenDigits.Add(tenDigit);
            }
        }

        var sqlQuery = @"
            SELECT DISTINCT
                LeadId,
                PrimaryVisitorName as VisitorName,
                CompanyName,
                PrimaryVisitorPhone as Phone,
                CASE
                    WHEN @PhoneCount > 0 AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(PrimaryVisitorPhone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '91', '') IN (
                        SELECT value FROM STRING_SPLIT(@TenDigits, ',')
                    ) THEN 100
                    WHEN @EmailCount > 0 AND PrimaryVisitorEmail IN (
                        SELECT value FROM STRING_SPLIT(@AllEmails, '|')
                    ) THEN 95
                    WHEN LOWER(PrimaryVisitorName) = LOWER(@Name) AND LOWER(CompanyName) = LOWER(@Company) THEN 90
                    WHEN LOWER(PrimaryVisitorName) = LOWER(@Name) THEN 70
                    WHEN LOWER(CompanyName) = LOWER(@Company) THEN 60
                    ELSE 0
                END as SimilarityScore
            FROM Leads
            WHERE (
                (@PhoneCount > 0 AND PrimaryVisitorPhone IS NOT NULL AND
                    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(PrimaryVisitorPhone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '91', '') IN (
                        SELECT value FROM STRING_SPLIT(@TenDigits, ',')
                    )
                )
                OR (@EmailCount > 0 AND PrimaryVisitorEmail IS NOT NULL AND
                    PrimaryVisitorEmail IN (
                        SELECT value FROM STRING_SPLIT(@AllEmails, '|')
                    )
                )
                OR (ExhibitionId = @ExhibitionId AND PrimaryVisitorName IS NOT NULL AND CompanyName IS NOT NULL AND
                    LOWER(PrimaryVisitorName) = LOWER(@Name) AND LOWER(CompanyName) = LOWER(@Company)
                )
                OR (ExhibitionId = @ExhibitionId AND @Company = '' AND PrimaryVisitorName IS NOT NULL AND LOWER(PrimaryVisitorName) = LOWER(@Name))
                OR (ExhibitionId = @ExhibitionId AND @Name = '' AND CompanyName IS NOT NULL AND LOWER(CompanyName) = LOWER(@Company))
            )
            ORDER BY SimilarityScore DESC
        ";

        var matches = (await conn.QueryAsync<DuplicateInfo>(
            sqlQuery,
            new {
                ExhibitionId = exhibitionId,
                TenDigits = string.Join(",", tenDigits),
                PhoneCount = tenDigits.Count,
                AllEmails = string.Join("|", allEmails),
                EmailCount = allEmails.Count,
                Name = primaryName?.Trim() ?? "",
                Company = companyName?.Trim() ?? ""
            })).ToList();

        duplicates = matches.Where(m => m.SimilarityScore > 0).DistinctBy(d => d.LeadId).ToList();

        _logger.LogInformation("Found {Count} duplicate(s) in exhibition {ExhibitionId}",
            duplicates.Count, exhibitionId);

        return new DuplicateCheckResult(duplicates.Any(), duplicates.Count, duplicates.OrderByDescending(d => d.SimilarityScore).ToList());
    }

    private static string NormalizePhoneNumber(string phone)
    {
        if (string.IsNullOrEmpty(phone))
            return string.Empty;

        var digits = new string(phone.Where(char.IsDigit).ToArray());

        if (digits.Length == 10)
            digits = "91" + digits;

        return digits;
    }

    private (string Segment, string Priority) SegmentLead(string? designation)
    {
        if (string.IsNullOrEmpty(designation))
            return ("general", "medium");

        var lower = designation.ToLower();

        if (lower.Contains("director") || lower.Contains("ceo") || lower.Contains("owner") ||
            lower.Contains("managing") || lower.Contains("proprietor") || lower.Contains("chairman"))
            return ("decision_maker", "high");

        if (lower.Contains("manager") || lower.Contains("head") || lower.Contains("lead") ||
            lower.Contains("supervisor") || lower.Contains("executive"))
            return ("influencer", "medium");

        if (lower.Contains("engineer") || lower.Contains("technical") || lower.Contains("analyst"))
            return ("researcher", "medium");

        return ("general", "medium");
    }

    private async Task UpdateLeadWithExtraction(Microsoft.Data.SqlClient.SqlConnection conn, int leadId, CardExtractionData data, (string Segment, string Priority) segmentInfo)
    {
        var primaryPerson = data.Persons.FirstOrDefault();

        await conn.ExecuteAsync(@"
            UPDATE Leads SET
                CompanyName = @CompanyName,
                PrimaryVisitorName = @Name,
                PrimaryVisitorDesignation = @Designation,
                PrimaryVisitorPhone = @Phone,
                PrimaryVisitorEmail = @Email,
                Segment = @Segment,
                Priority = @Priority,
                RawCardJson = @RawJson,
                UpdatedAt = GETUTCDATE()
            WHERE LeadId = @LeadId",
            new
            {
                LeadId = leadId,
                data.CompanyName,
                Name = primaryPerson?.Name,
                Designation = primaryPerson?.Designation,
                Phone = data.Phones.FirstOrDefault() ?? primaryPerson?.Phones.FirstOrDefault(),
                Email = data.Emails.FirstOrDefault() ?? primaryPerson?.Emails.FirstOrDefault(),
                segmentInfo.Segment,
                segmentInfo.Priority,
                RawJson = JsonSerializer.Serialize(data)
            });
    }

    private async Task SaveLeadEntities(Microsoft.Data.SqlClient.SqlConnection conn, int leadId, CardExtractionData data)
    {
        var additionalPersons = data.Persons.Skip(1).Select(p => new
        {
            name = p.Name,
            designation = p.Designation,
            phone = p.Phones.FirstOrDefault(),
            email = p.Emails.FirstOrDefault()
        }).ToList();

        var additionalPersonsJson = additionalPersons.Any() ? JsonSerializer.Serialize(additionalPersons) : null;
        var phonesJson = data.Phones.Distinct().Select(p => new { phone = p, type = "" }).ToList();
        var phonesJsonString = phonesJson.Any() ? JsonSerializer.Serialize(phonesJson) : null;
        var emailsJson = data.Emails.Distinct().Select(e => new { email = e, type = "" }).ToList();
        var emailsJsonString = emailsJson.Any() ? JsonSerializer.Serialize(emailsJson) : null;
        var addressesJson = data.Addresses.Select(a => new
        {
            address = a.Address,
            type = a.AddressType,
            city = a.City,
            state = a.State,
            country = a.Country,
            pincode = a.PinCode
        }).ToList();
        var addressesJsonString = addressesJson.Any() ? JsonSerializer.Serialize(addressesJson) : null;
        var websitesJsonString = data.Websites.Any() ? JsonSerializer.Serialize(data.Websites) : null;
        var servicesJsonString = data.Services.Any() ? JsonSerializer.Serialize(data.Services) : null;
        var brandsJson = data.Brands.Select(b => new { brand = b.BrandName, relationship = b.Relationship }).ToList();
        var brandsJsonString = brandsJson.Any() ? JsonSerializer.Serialize(brandsJson) : null;

        await conn.ExecuteAsync(@"
            UPDATE Leads SET
                AdditionalPersons = @AdditionalPersons,
                PhoneNumbers = @PhoneNumbers,
                EmailAddresses = @EmailAddresses,
                Addresses = @Addresses,
                Websites = @Websites,
                Services = @Services,
                Brands = @Brands,
                UpdatedAt = GETUTCDATE()
            WHERE LeadId = @LeadId",
            new
            {
                LeadId = leadId,
                AdditionalPersons = additionalPersonsJson,
                PhoneNumbers = phonesJsonString,
                EmailAddresses = emailsJsonString,
                Addresses = addressesJsonString,
                Websites = websitesJsonString,
                Services = servicesJsonString,
                Brands = brandsJsonString
            });
    }

    private async Task AddSystemMessage(Microsoft.Data.SqlClient.SqlConnection conn, int leadId, string text, int? employeeId = null)
    {
        await conn.ExecuteAsync(@"
            INSERT INTO LeadMessages (LeadId, SenderType, SenderEmployeeId, MessageText, CreatedAt)
            VALUES (@LeadId, 'system', @EmployeeId, @Text, GETUTCDATE())",
            new { LeadId = leadId, EmployeeId = employeeId, Text = text });
    }
}
