using ELCS.API.Data;
using ELCS.API.Services;
using Microsoft.AspNetCore.ResponseCompression;
using Serilog;
using System.IO.Compression;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Use snake_case for JSON property names (frontend expects this)
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
        // Handle DateTime serialization as UTC with 'Z' suffix to fix timezone issues
        options.JsonSerializerOptions.Converters.Add(new ELCS.API.Utils.UtcDateTimeConverter());
        options.JsonSerializerOptions.Converters.Add(new ELCS.API.Utils.UtcNullableDateTimeConverter());
        // Handle enums
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "ELCS API", Version = "v1" });
});

// Database Connection (ADO.NET)
builder.Services.AddSingleton<IDbConnection, DbConnectionFactory>();

// Register Services
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IRoleService, RoleService>();
builder.Services.AddScoped<ILeadService, LeadService>();
builder.Services.AddScoped<IExtractionService, ExtractionService>();
builder.Services.AddScoped<IOcrService, GoogleVisionOcrService>();
builder.Services.AddScoped<ISpeechService, GoogleSpeechService>();
builder.Services.AddScoped<IOpenAIService, OpenAIService>();

// Response Compression for faster loading
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/json",
        "text/plain",
        "image/svg+xml"
    });
});

builder.Services.Configure<BrotliCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});

builder.Services.Configure<GzipCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});

// CORS — origins loaded from appsettings.json "AllowedOrigins" array
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();

// Response compression - must be early in pipeline
app.UseResponseCompression();

// Apply CORS before routing
app.UseCors("AllowFrontend");

app.MapControllers();

// Health check endpoint
app.MapGet("/health", async (IDbConnection db) =>
{
    try
    {
        using var conn = db.CreateConnection();
        await conn.OpenAsync();
        return Results.Ok(new { status = "healthy", database = "connected" });
    }
    catch
    {
        return Results.Ok(new { status = "degraded", database = "disconnected" });
    }
});

app.Run();
