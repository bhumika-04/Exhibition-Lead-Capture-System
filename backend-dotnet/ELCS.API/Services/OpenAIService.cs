using System.Text.Json;
using System.Text.Json.Serialization;
using System.ClientModel;
using OpenAI;
using OpenAI.Chat;
using ELCS.API.DTOs;

namespace ELCS.API.Services;

public class OpenAIService : IOpenAIService
{
    private readonly ILogger<OpenAIService> _logger;
    private readonly IConfiguration _config;
    private readonly ChatClient _chatClient;

    public OpenAIService(ILogger<OpenAIService> logger, IConfiguration config)
    {
        _logger = logger;
        _config = config;

        var apiKey = _config["OpenAI:ApiKey"] ?? throw new InvalidOperationException("OpenAI API key not configured");
        var model = _config["OpenAI:Model"] ?? "gpt-4o-mini";

        // Create OpenAI client with API key credential
        var credential = new ApiKeyCredential(apiKey);
        var openAIClient = new OpenAIClient(credential);
        _chatClient = openAIClient.GetChatClient(model);
    }

    public async Task<CardExtractionData> NormalizeCardDataAsync(string frontText, string? backText, List<string>? regexPhones)
    {
        var systemPrompt = GetCardExtractionSystemPrompt();
        var userPrompt = BuildCardExtractionPrompt(frontText, backText, regexPhones);

        try
        {
            var options = new ChatCompletionOptions
            {
                Temperature = 0.1f,
                MaxOutputTokenCount = int.Parse(_config["OpenAI:MaxTokens"] ?? "2000"),
                ResponseFormat = ChatResponseFormat.CreateJsonObjectFormat()
            };

            var messages = new List<ChatMessage>
            {
                new SystemChatMessage(systemPrompt),
                new UserChatMessage(userPrompt)
            };

            var response = await _chatClient.CompleteChatAsync(messages, options);
            var jsonContent = response.Value.Content[0].Text;

            _logger.LogDebug("OpenAI Card Response: {Response}", jsonContent);

            var result = JsonSerializer.Deserialize<CardExtractionJsonResult>(jsonContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result == null)
            {
                _logger.LogWarning("Failed to parse OpenAI response");
                return CreateEmptyCardExtractionData(frontText, backText);
            }

            // Convert to DTO
            return new CardExtractionData(
                CompanyName: result.CompanyName,
                Persons: result.Persons?.Select(p => new PersonData(
                    Name: p.Name,
                    Designation: p.Designation,
                    Phones: p.Phones ?? new List<string>(),
                    Emails: p.Emails ?? new List<string>(),
                    IsPrimary: p.IsPrimary
                )).ToList() ?? new List<PersonData>(),
                Phones: result.Phones ?? regexPhones ?? new List<string>(),
                Emails: result.Emails ?? new List<string>(),
                Websites: result.Websites ?? new List<string>(),
                Addresses: result.Addresses?.Select(a => new AddressData(
                    AddressType: a.AddressType,
                    Address: a.Address,
                    City: a.City,
                    State: a.State,
                    Country: a.Country,
                    PinCode: a.PinCode
                )).ToList() ?? new List<AddressData>(),
                Services: result.Services ?? new List<string>(),
                Brands: result.Brands?.Select(b => new BrandData(
                    BrandName: b.BrandName ?? "",
                    Relationship: b.Relationship
                )).ToList() ?? new List<BrandData>(),
                Confidence: result.Confidence,
                RawFrontText: frontText,
                RawBackText: backText
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI card normalization failed");
            return CreateEmptyCardExtractionData(frontText, backText);
        }
    }

    public async Task<VoiceAnalysisResult> AnalyzeVoiceTranscriptAsync(string transcript)
    {
        var systemPrompt = GetVoiceAnalysisSystemPrompt();
        var userPrompt = $"VOICE TRANSCRIPT:\n{transcript}\n\nAnalyze and return JSON.";

        try
        {
            var options = new ChatCompletionOptions
            {
                Temperature = 0.2f,
                MaxOutputTokenCount = int.Parse(_config["OpenAI:MaxTokens"] ?? "2000"),
                ResponseFormat = ChatResponseFormat.CreateJsonObjectFormat()
            };

            var messages = new List<ChatMessage>
            {
                new SystemChatMessage(systemPrompt),
                new UserChatMessage(userPrompt)
            };

            var response = await _chatClient.CompleteChatAsync(messages, options);
            var jsonContent = response.Value.Content[0].Text;

            var result = JsonSerializer.Deserialize<VoiceAnalysisJsonResult>(jsonContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result == null)
            {
                return new VoiceAnalysisResult(
                    Transcript: transcript,
                    Summary: transcript[..Math.Min(200, transcript.Length)],
                    Topics: new List<string>(),
                    Segment: "general",
                    Priority: "medium",
                    InterestLevel: "warm",
                    Confidence: 0,
                    LeadName: null,
                    CompanyName: null
                );
            }

            return new VoiceAnalysisResult(
                Transcript: result.Transcript ?? transcript,
                Summary: result.Summary ?? "",
                Topics: result.Topics ?? new List<string>(),
                Segment: result.Segment ?? "general",
                Priority: result.Priority ?? "medium",
                InterestLevel: result.InterestLevel ?? "warm",
                Confidence: result.Confidence,
                LeadName: result.LeadName,
                CompanyName: result.CompanyName
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Voice analysis failed");
            return new VoiceAnalysisResult(
                Transcript: transcript,
                Summary: transcript[..Math.Min(200, transcript.Length)],
                Topics: new List<string>(),
                Segment: "general",
                Priority: "medium",
                InterestLevel: "warm",
                Confidence: 0,
                LeadName: null,
                CompanyName: null
            );
        }
    }

    private CardExtractionData CreateEmptyCardExtractionData(string frontText, string? backText)
    {
        return new CardExtractionData(
            CompanyName: null,
            Persons: new List<PersonData>(),
            Phones: new List<string>(),
            Emails: new List<string>(),
            Websites: new List<string>(),
            Addresses: new List<AddressData>(),
            Services: new List<string>(),
            Brands: new List<BrandData>(),
            Confidence: 0,
            RawFrontText: frontText,
            RawBackText: backText
        );
    }

    private string BuildCardExtractionPrompt(string frontText, string? backText, List<string>? regexPhones)
    {
        var prompt = $"FRONT OCR TEXT:\n{frontText}\n";

        if (!string.IsNullOrEmpty(backText))
            prompt += $"\nBACK OCR TEXT:\n{backText}\n";

        if (regexPhones?.Any() == true)
            prompt += $"\nREGEX PHONES (hints): {string.Join(", ", regexPhones)}\n";

        prompt += @"
Extract JSON with fields:
{
  ""company_name"": string|null,
  ""persons"": [{ ""name"": string, ""designation"": string|null, ""phones"": [""with country code e.g. +91XXXXXXXXXX""], ""emails"": [], ""is_primary"": bool }],
  ""phones"": [""ALWAYS with country code e.g. +91XXXXXXXXXX for Indian, +1 for US, etc.""],
  ""emails"": [string],
  ""websites"": [string],
  ""addresses"": [{ ""address_type"": string|null, ""address"": string, ""city"": string|null, ""state"": ""infer from city if not printed"", ""country"": string|null, ""pin_code"": string|null }],
  ""services"": [string],
  ""brands"": [{ ""brand_name"": string, ""relationship"": string|null }],
  ""confidence"": 0.0 - 1.0
}";

        return prompt;
    }

    private static string GetCardExtractionSystemPrompt()
    {
        return @"You are an expert Indian Visiting Card Extraction Engine with ZERO HALLUCINATION POLICY.

CRITICAL RULES:
1. Extract ONLY what is 100% visible in the OCR text
2. If something is unclear or not present -> set to null
3. NEVER guess or hallucinate missing information
4. Fix common OCR errors: O->0, I->1, l->1

MULTIPLE COMPANIES (DEALER CARDS):
- company_name: Main business name only
- brands: Array of associated brands with relationship

PHONE HANDLING — ALWAYS INCLUDE COUNTRY CODE:
- Indian mobile (10 digits starting 6-9, or ISD prefix +91/0091/091): normalize to +91XXXXXXXXXX
- Remove spaces, dashes, brackets; strip leading 0 from local Indian numbers
- International numbers: keep the country code as-is (e.g. +1, +44, +971, +65)
- If a number already has +91 or 0091 or 91- prefix, normalize to +91XXXXXXXXXX
- Use regex hints as fallback
- Fix OCR errors before extracting

ADDRESS HANDLING — INFER STATE FROM CITY:
- If state is not explicitly printed, infer it from the city using your knowledge of Indian cities:
  Delhi/New Delhi → Delhi, Mumbai/Pune/Nagpur/Nashik/Thane/Navi Mumbai → Maharashtra,
  Bengaluru/Bangalore/Mysuru/Hubli/Mangaluru → Karnataka, Chennai/Coimbatore/Madurai → Tamil Nadu,
  Hyderabad/Secunderabad/Warangal/Vijayawada/Visakhapatnam → Telangana/Andhra Pradesh,
  Kolkata/Howrah/Durgapur → West Bengal, Ahmedabad/Surat/Vadodara/Rajkot → Gujarat,
  Jaipur/Jodhpur/Udaipur/Kota → Rajasthan, Lucknow/Kanpur/Agra/Varanasi/Noida/Ghaziabad → Uttar Pradesh,
  Bhopal/Indore/Jabalpur/Gwalior → Madhya Pradesh, Patna/Muzaffarpur → Bihar,
  Chandigarh → Chandigarh, Ludhiana/Amritsar/Jalandhar → Punjab,
  Bhubaneswar/Cuttack → Odisha, Guwahati → Assam, Dehradun → Uttarakhand,
  Ranchi → Jharkhand, Raipur → Chhattisgarh, Thiruvananthapuram/Kochi/Kozhikode → Kerala,
  Panaji/Goa → Goa, Shillong → Meghalaya, Imphal → Manipur, Gangtok → Sikkim
- If state is explicitly printed on the card, always use that value (do not override)
- For international addresses, use the country's state/province as given

Return STRICT JSON only.";
    }

    private static string GetVoiceAnalysisSystemPrompt()
    {
        return @"You are an Exhibition Lead Analyst fluent in Hindi, English, and Hinglish.

Analyze voice transcripts from exhibition sales teams capturing lead notes.

Return JSON:
{
  ""transcript"": ""cleaned text in original language"",
  ""summary"": ""Brief summary: lead name, company, problems discussed. Keep it concise."",
  ""topics"": [""problems discussed"", ""products/services discussed""],
  ""segment"": ""decision_maker|influencer|researcher|general"",
  ""priority"": ""high|medium|low"",
  ""interest_level"": ""hot|warm|cold"",
  ""confidence"": 0.0 - 1.0,
  ""lead_name"": ""person's name if mentioned, null otherwise"",
  ""company_name"": ""company name if mentioned, null otherwise""
}

GUIDELINES:
- LEAD_NAME and COMPANY_NAME: Extract if the person mentions ""I talked to [name] from [company]""
- SUMMARY: Include lead name, company, problems discussed. Example: ""Met Rajesh from ABC Industries. They need packaging automation.""
- TOPICS: Include problems/challenges discussed and products mentioned
- SEGMENT: decision_maker (can approve/order), influencer (recommends), researcher (info gathering), general
- PRIORITY: high (very interested), medium (interested), low (just exploring)
- INTEREST_LEVEL: hot (ready to buy), warm (interested), cold (casual inquiry)

Return summary and topics in ENGLISH even if transcript is Hindi/Hinglish.
Lead name and company name should be in original case as mentioned.";
    }

    // JSON deserialization classes
    private class CardExtractionJsonResult
    {
        [JsonPropertyName("company_name")]
        public string? CompanyName { get; set; }

        [JsonPropertyName("persons")]
        public List<PersonJsonResult>? Persons { get; set; }

        [JsonPropertyName("phones")]
        public List<string>? Phones { get; set; }

        [JsonPropertyName("emails")]
        public List<string>? Emails { get; set; }

        [JsonPropertyName("websites")]
        public List<string>? Websites { get; set; }

        [JsonPropertyName("addresses")]
        public List<AddressJsonResult>? Addresses { get; set; }

        [JsonPropertyName("services")]
        public List<string>? Services { get; set; }

        [JsonPropertyName("brands")]
        public List<BrandJsonResult>? Brands { get; set; }

        [JsonPropertyName("confidence")]
        public double Confidence { get; set; }
    }

    private class PersonJsonResult
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("designation")]
        public string? Designation { get; set; }

        [JsonPropertyName("phones")]
        public List<string>? Phones { get; set; }

        [JsonPropertyName("emails")]
        public List<string>? Emails { get; set; }

        [JsonPropertyName("is_primary")]
        public bool IsPrimary { get; set; }
    }

    private class AddressJsonResult
    {
        [JsonPropertyName("address_type")]
        public string? AddressType { get; set; }

        [JsonPropertyName("address")]
        public string? Address { get; set; }

        [JsonPropertyName("city")]
        public string? City { get; set; }

        [JsonPropertyName("state")]
        public string? State { get; set; }

        [JsonPropertyName("country")]
        public string? Country { get; set; }

        [JsonPropertyName("pin_code")]
        public string? PinCode { get; set; }
    }

    private class BrandJsonResult
    {
        [JsonPropertyName("brand_name")]
        public string? BrandName { get; set; }

        [JsonPropertyName("relationship")]
        public string? Relationship { get; set; }
    }

    private class VoiceAnalysisJsonResult
    {
        [JsonPropertyName("transcript")]
        public string? Transcript { get; set; }

        [JsonPropertyName("summary")]
        public string? Summary { get; set; }

        [JsonPropertyName("topics")]
        public List<string>? Topics { get; set; }

        [JsonPropertyName("segment")]
        public string? Segment { get; set; }

        [JsonPropertyName("priority")]
        public string? Priority { get; set; }

        [JsonPropertyName("interest_level")]
        public string? InterestLevel { get; set; }

        [JsonPropertyName("confidence")]
        public double Confidence { get; set; }

        [JsonPropertyName("lead_name")]
        public string? LeadName { get; set; }

        [JsonPropertyName("company_name")]
        public string? CompanyName { get; set; }
    }
}
