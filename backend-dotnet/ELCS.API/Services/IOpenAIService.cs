using ELCS.API.DTOs;

namespace ELCS.API.Services;

public interface IOpenAIService
{
    Task<CardExtractionData> NormalizeCardDataAsync(string frontText, string? backText, List<string>? regexPhones);
    Task<VoiceAnalysisResult> AnalyzeVoiceTranscriptAsync(string transcript);
}

public record VoiceAnalysisResult(
    string Transcript,
    string Summary,
    List<string> Topics,
    string Segment,
    string Priority,
    string InterestLevel,
    double Confidence,
    string? LeadName,
    string? CompanyName
);
