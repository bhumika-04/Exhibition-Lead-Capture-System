using Google.Cloud.Vision.V1;
using ELCS.API.DTOs;
using System.Text.RegularExpressions;

namespace ELCS.API.Services;

public class GoogleVisionOcrService : IOcrService
{
    private readonly ILogger<GoogleVisionOcrService> _logger;
    private readonly ImageAnnotatorClient _visionClient;
    private readonly string _credentialsPath;

    public GoogleVisionOcrService(ILogger<GoogleVisionOcrService> logger, IConfiguration config, IWebHostEnvironment env)
    {
        _logger = logger;

        // Get credentials path from config or use default
        var configPath = config["GoogleVision:CredentialsPath"];
        _credentialsPath = string.IsNullOrEmpty(configPath)
            ? Path.Combine(env.ContentRootPath, "elcs-vision-service-b37e72f1cf1b.json")
            : Path.IsPathRooted(configPath)
                ? configPath
                : Path.Combine(env.ContentRootPath, configPath);

        try
        {
            if (!File.Exists(_credentialsPath))
            {
                throw new FileNotFoundException($"Google Vision credentials file not found at: {_credentialsPath}");
            }

            // Set environment variable for Google Cloud authentication
            Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", _credentialsPath);

            _visionClient = ImageAnnotatorClient.Create();
            _logger.LogInformation("Google Vision API client initialized successfully using credentials: {Path}", _credentialsPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize Google Vision API client");
            throw;
        }
    }

    public async Task<OcrResult> ExtractTextAsync(string imagePath)
    {
        var startTime = DateTime.UtcNow;
        try
        {
            _logger.LogInformation("Starting Google Vision OCR for image: {ImagePath}", imagePath);

            if (!File.Exists(imagePath))
            {
                throw new FileNotFoundException($"Image file not found: {imagePath}");
            }

            // Load image
            var image = await Google.Cloud.Vision.V1.Image.FromFileAsync(imagePath);

            // Perform text detection
            var response = await _visionClient.DetectTextAsync(image);

            var processingTime = DateTime.UtcNow - startTime;

            if (response == null || response.Count == 0)
            {
                _logger.LogWarning("No text detected in image: {ImagePath}", imagePath);
                return new OcrResult(
                    Text: string.Empty,
                    Confidence: 0.0,
                    DetectedPhones: new List<string>(),
                    ProcessingTime: processingTime
                );
            }

            // First annotation contains full text
            var fullText = response[0].Description;

            // Google Vision text detection doesn't provide reliable confidence scores per annotation
            // Use a fixed high confidence value since text detection is generally reliable
            double avgConfidence = 0.9;

            // Extract phone numbers
            var detectedPhones = ExtractPhoneNumbers(fullText);

            _logger.LogInformation(
                "Google Vision OCR completed. Text length: {Length}, Confidence: {Confidence:P0}, Phones: {PhoneCount}, Time: {Time:F2}s",
                fullText.Length,
                avgConfidence,
                detectedPhones.Count,
                processingTime.TotalSeconds
            );

            return new OcrResult(
                Text: fullText,
                Confidence: avgConfidence,
                DetectedPhones: detectedPhones,
                ProcessingTime: processingTime
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Google Vision OCR failed for image: {ImagePath}", imagePath);
            throw;
        }
    }

    public async Task<OcrResult> ExtractTextAsync(Stream imageStream)
    {
        var startTime = DateTime.UtcNow;
        try
        {
            _logger.LogInformation("Starting Google Vision OCR for image stream");

            // Load image from stream
            var image = await Google.Cloud.Vision.V1.Image.FromStreamAsync(imageStream);

            // Perform text detection
            var response = await _visionClient.DetectTextAsync(image);

            var processingTime = DateTime.UtcNow - startTime;

            if (response == null || response.Count == 0)
            {
                _logger.LogWarning("No text detected in image stream");
                return new OcrResult(
                    Text: string.Empty,
                    Confidence: 0.0,
                    DetectedPhones: new List<string>(),
                    ProcessingTime: processingTime
                );
            }

            // First annotation contains full text
            var fullText = response[0].Description;

            // Google Vision text detection doesn't provide reliable confidence scores per annotation
            // Use a fixed high confidence value since text detection is generally reliable
            double avgConfidence = 0.9;

            // Extract phone numbers
            var detectedPhones = ExtractPhoneNumbers(fullText);

            _logger.LogInformation(
                "Google Vision OCR completed. Text length: {Length}, Confidence: {Confidence:P0}, Phones: {PhoneCount}, Time: {Time:F2}s",
                fullText.Length,
                avgConfidence,
                detectedPhones.Count,
                processingTime.TotalSeconds
            );

            return new OcrResult(
                Text: fullText,
                Confidence: avgConfidence,
                DetectedPhones: detectedPhones,
                ProcessingTime: processingTime
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Google Vision OCR failed for image stream");
            throw;
        }
    }

    private List<string> ExtractPhoneNumbers(string text)
    {
        var phones = new HashSet<string>();

        // Remove common separators for easier matching
        var cleanedText = Regex.Replace(text, @"[\s\-\.\(\)]+", "");

        // Indian phone patterns
        var patterns = new[]
        {
            @"\+91\d{10}",           // +91XXXXXXXXXX
            @"91\d{10}",             // 91XXXXXXXXXX
            @"\d{10}",               // XXXXXXXXXX (10 digits)
            @"\+\d{12,13}"           // International format
        };

        foreach (var pattern in patterns)
        {
            var matches = Regex.Matches(cleanedText, pattern);
            foreach (Match match in matches)
            {
                var phone = match.Value;

                // Normalize to +91XXXXXXXXXX format
                if (phone.StartsWith("+91"))
                {
                    phones.Add(phone);
                }
                else if (phone.StartsWith("91") && phone.Length == 12)
                {
                    phones.Add("+" + phone);
                }
                else if (phone.Length == 10)
                {
                    phones.Add("+91" + phone);
                }
                else if (phone.StartsWith("+") && phone.Length >= 12)
                {
                    phones.Add(phone);
                }
            }
        }

        return phones.ToList();
    }
}
