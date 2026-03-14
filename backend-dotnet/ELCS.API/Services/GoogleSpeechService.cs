using Google.Cloud.Speech.V1;
using ELCS.API.DTOs;

namespace ELCS.API.Services;

public interface ISpeechService
{
    Task<string> TranscribeAudioAsync(Stream audioStream, string fileName);
}

public class GoogleSpeechService : ISpeechService
{
    private readonly ILogger<GoogleSpeechService> _logger;
    private readonly SpeechClient _speechClient;
    private readonly string _credentialsPath;

    public GoogleSpeechService(ILogger<GoogleSpeechService> logger, IConfiguration config, IWebHostEnvironment env)
    {
        _logger = logger;

        // Use same credentials as Vision API
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
                throw new FileNotFoundException($"Google credentials file not found at: {_credentialsPath}");
            }

            // Set environment variable for Google Cloud authentication
            Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", _credentialsPath);

            _speechClient = SpeechClient.Create();
            _logger.LogInformation("Google Speech API client initialized successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize Google Speech API client");
            throw;
        }
    }

    public async Task<string> TranscribeAudioAsync(Stream audioStream, string fileName)
    {
        try
        {
            _logger.LogInformation("Starting Google Speech transcription for: {FileName}", fileName);

            // Read audio stream into bytes (no disk I/O)
            using var ms = new MemoryStream();
            await audioStream.CopyToAsync(ms);
            var audioBytes = ms.ToArray();

            // Detect audio format from file extension
            var ext = Path.GetExtension(fileName).ToLower();
            var encoding = ext switch
            {
                ".webm" => RecognitionConfig.Types.AudioEncoding.WebmOpus,
                ".mp3"  => RecognitionConfig.Types.AudioEncoding.Mp3,
                ".wav"  => RecognitionConfig.Types.AudioEncoding.Linear16,
                ".ogg"  => RecognitionConfig.Types.AudioEncoding.OggOpus,
                _       => RecognitionConfig.Types.AudioEncoding.EncodingUnspecified
            };

            var config = new RecognitionConfig
            {
                Encoding = encoding,
                LanguageCode = "en-IN",
                AlternativeLanguageCodes = { "hi-IN" },
                EnableAutomaticPunctuation = true,
                Model = "default"
            };

            if (encoding == RecognitionConfig.Types.AudioEncoding.Linear16)
                config.SampleRateHertz = 16000;

            var audio = RecognitionAudio.FromBytes(audioBytes);
            var response = await _speechClient.RecognizeAsync(config, audio);

            if (response.Results.Count == 0)
            {
                _logger.LogWarning("No speech detected in audio: {FileName}", fileName);
                return string.Empty;
            }

            var fullTranscript = string.Join(" ",
                response.Results
                    .Where(r => r.Alternatives.Count > 0)
                    .Select(r => r.Alternatives[0].Transcript));

            _logger.LogInformation("Speech transcription completed. Length: {Length} chars", fullTranscript.Length);
            return fullTranscript;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Google Speech transcription failed for: {FileName}", fileName);
            throw;
        }
    }
}
