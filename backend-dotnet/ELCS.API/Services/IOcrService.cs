namespace ELCS.API.Services;

public interface IOcrService
{
    Task<OcrResult> ExtractTextAsync(string imagePath);
    Task<OcrResult> ExtractTextAsync(Stream imageStream);
}

public record OcrResult(
    string Text,
    double Confidence,
    List<string> DetectedPhones,
    TimeSpan ProcessingTime
);
