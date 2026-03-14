# ELCS Backend — C# (.NET 8)

Exhibition Lead Capture System — ASP.NET Core 8 API

## Requirements

- .NET 8 SDK
- SQL Server 2019+
- Google Cloud Vision API credentials (JSON key file)
- Google Cloud Speech-to-Text credentials (same JSON key)
- OpenAI API key

## Quick Start

### 1. Configure appsettings.json

```json
{
  "Urls": "http://localhost:5008",
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR_SERVER\\SQLEXPRESS;Database=ELCS;Integrated Security=True;TrustServerCertificate=True;"
  },
  "OpenAI": {
    "ApiKey": "sk-your-openai-api-key",
    "Model": "gpt-4o-mini",
    "MaxTokens": 2000
  },
  "WhatsApp": {
    "ApiUrl": "https://api.interakt.ai/v1",
    "ApiKey": "your-interakt-api-key",
    "PhoneNumber": "91XXXXXXXXXX"
  },
  "GoogleVision": {
    "CredentialsPath": "elcs-vision-service-XXXXX.json"
  }
}
```

### 2. Setup Tesseract (fallback OCR)

```bash
mkdir ELCS.API/tessdata
# Download eng.traineddata (~4MB) to ELCS.API/tessdata/
```

### 3. Build and Run

```bash
cd ELCS.API
dotnet restore
dotnet build
dotnet run
```

Available at:
- API: `http://localhost:5008`
- Swagger: `http://localhost:5008/swagger`
- Hangfire: `http://localhost:5008/hangfire`

## Project Structure

```
ELCS.API/
├── Controllers/
│   ├── AuthController.cs           POST /api/auth/login
│   ├── ExtractionController.cs     Card OCR + voice extraction
│   ├── LeadsController.cs          Lead CRUD + send-greeting
│   ├── ExhibitionsController.cs    Exhibition CRUD
│   ├── AnalyticsController.cs      Dashboard metrics
│   └── WhatsAppController.cs       Outgoing greeting only
├── Services/
│   ├── ExtractionService.cs        OCR pipeline (Vision → OpenAI → save)
│   ├── LeadService.cs              Lead CRUD, JSON column parsing
│   ├── OpenAIService.cs            Card normalize, voice analyze
│   ├── GoogleVisionOcrService.cs   Google Vision OCR
│   ├── GoogleSpeechService.cs      Google Speech-to-Text
│   ├── WhatsAppService.cs          Interakt API client (outgoing only)
│   ├── FileStorageService.cs       Save uploads to /uploads/
│   ├── AuthService.cs              SHA256 password hashing
│   └── TaskQueueService.cs         Async task tracking
├── Data/
│   └── DbConnection.cs             Dapper SQL connection factory
├── Models/                         POCO models
├── DTOs/                           Request/Response objects
├── database/
│   ├── 001_create_database.sql     Schema (run first)
│   └── 002_seed_essential_data.sql Lookup data + admin user
└── Program.cs
```

## API Reference

### Authentication
```
POST /api/auth/login
Body: { "Email": "user@example.com", "Password": "password" }
Returns: { "success": true, "employee_id": 1, "full_name": "...", "email": "..." }
```

### Card Extraction
```
POST /api/extraction/upload-card-image   multipart: image, side(front|back)
POST /api/extraction/card/preview        multipart: frontImage, backImage?, exhibitionId
POST /api/extraction/card/confirm        json: { extraction, exhibition_id, employee_id, front_image_path, back_image_path }
POST /api/extraction/card                multipart: frontImage, backImage?, exhibitionId, employeeId (sync, creates lead)
POST /api/extraction/voice               multipart: audioFile, leadId?, employeeId?
GET  /api/extraction/task/{taskId}       async task status polling
```

### Leads
```
GET    /api/leads                         query: exhibition_id, source_code, status_code, segment, priority, limit, offset
GET    /api/leads/{id}
POST   /api/leads
PUT    /api/leads/{id}
DELETE /api/leads/{id}
GET    /api/leads/search                  query: name
POST   /api/leads/{id}/send-greeting      send WhatsApp greeting via Interakt
POST   /api/leads/{id}/smart-message      AI note analysis (employee internal use)
POST   /api/leads/{id}/send-meeting-notification
```

### Exhibitions
```
GET    /api/exhibitions
POST   /api/exhibitions
PUT    /api/exhibitions/{id}
DELETE /api/exhibitions/{id}              soft delete (IsActive=0)
```

### Analytics
```
GET /api/analytics/summary                query: exhibition_id?
GET /api/analytics/employee-performance   query: exhibition_id?
GET /api/analytics/followup-stats
GET /api/analytics/scheduled-meetings
GET /api/analytics/exhibitions
```

### Other
```
GET /health
GET /hangfire      background job dashboard
```

## Key Technical Details

### JSON Serialization
- Uses `SnakeCaseLower` naming policy — all responses are `snake_case`
- DateTime handled as UTC, displayed as IST in frontend

### Authentication
- No JWT — SHA256 password hash stored in `Employees` table
- Frontend stores `employee_id` + `full_name` in localStorage
- Auth check: localStorage `auth_token` === `'authenticated'`

### Card Extraction Pipeline
1. Image uploaded immediately to `/uploads/cards/temp/`
2. Google Vision API performs OCR
3. OpenAI GPT-4o-mini normalizes extracted text → structured JSON
4. Duplicate detection via SQL (phone/email/company similarity scoring)
5. Lead segmentation (decision_maker / influencer / researcher / general)
6. On confirm: lead saved, image moved from temp to permanent path

### Data Storage
- Lead arrays (phones, emails, addresses, etc.) stored as normalized relational tables
- `LeadAttachments` stores file paths relative to `/uploads/`
- Static files served at `/uploads/cards/*`, `/uploads/audio/*`

### WhatsApp Integration (Outgoing Only)
- Uses Interakt API
- Sends greeting on card confirmation (`send-greeting` endpoint)
- Sends meeting notification from voice note extraction
- No incoming webhook processing

### Background Jobs (Hangfire)
- SQL Server storage
- Dashboard at `/hangfire` (no auth — internal use only)
- Used for async card extraction tasks

## CORS Configuration

Allowed origins:
- `http://localhost:3000`
- `http://localhost:3001`
- `http://103.150.136.76:3003`
- `https://exhibitionvistingcard.vercel.app`
- `https://exhibitionvistingcard-*.vercel.app`

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Tesseract not found` | Ensure `tessdata/eng.traineddata` exists |
| `Google credentials not found` | Place JSON key in `ELCS.API/`, update `CredentialsPath` |
| `Database connection failed` | Check connection string, SQL Server must be running |
| `OpenAI error` | Verify API key, check rate limits |
| Port conflict | Change `Urls` in `appsettings.json` |
