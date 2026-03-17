# ELCS Backend — ASP.NET Core (.NET 10)

Exhibition Lead Capture System — REST API

---

## Requirements

- .NET 10 SDK
- SQL Server 2019+
- Google Cloud credentials JSON (Vision API + Speech-to-Text)
- OpenAI API key

---

## Setup

### 1. Configure `appsettings.json`

Copy the example and fill in your values:

```bash
cp appsettings.example.json appsettings.json
```

```json
{
  "Urls": "http://localhost:5008",
  "AllowedOrigins": [
    "http://localhost:3000",
    "https://your-frontend-domain.com"
  ],
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=YOUR_SERVER\\SQLEXPRESS;Initial Catalog=ELCS;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;Encrypt=True"
  },
  "OpenAI": {
    "ApiKey": "sk-your-openai-api-key",
    "Model": "gpt-4o-mini",
    "MaxTokens": 500
  },
  "GoogleVision": {
    "CredentialsPath": "your-google-vision-credentials.json"
  },
  "CRM": {
    "CompanyId": 1,
    "LedgerGroupId": 1,
    "LedgerCodePrefix": "C",
    "LedgerType": "Sundry Debtors",
    "SystemUserId": 1
  }
}
```

### 2. Database

Run `database/001_create_database.sql` on your SQL Server instance.
See the root `README.md` for full database setup instructions.

### 3. Run

```bash
cd ELCS.API
dotnet restore
dotnet run
```

- API: `http://localhost:5008`
- Swagger: `http://localhost:5008/swagger`

---

## Project Structure

```
ELCS.API/
├── Program.cs
├── ELCS.API.csproj
├── appsettings.json              (not committed)
├── appsettings.example.json      Template
│
├── Controllers/
│   ├── AuthController.cs         POST /api/auth/login
│   ├── ExtractionController.cs   Card OCR + voice extraction
│   ├── LeadsController.cs        Lead CRUD
│   ├── ExhibitionsController.cs  Exhibition CRUD
│   ├── AnalyticsController.cs    Dashboard metrics
│   ├── RolesController.cs        Role management
│   └── UsersController.cs        User management
│
├── Services/
│   ├── ExtractionService.cs      OCR pipeline (Vision → OpenAI → save)
│   ├── LeadService.cs            Lead CRUD, JSON column parsing, CRM push
│   ├── OpenAIService.cs          Card normalisation + voice analysis
│   ├── GoogleVisionOcrService.cs Google Vision OCR wrapper
│   ├── GoogleSpeechService.cs    Google Speech-to-Text wrapper
│   ├── AuthService.cs            SHA256 auth, profile updates
│   └── RoleService.cs            Role & permission management
│
├── Models/
│   ├── Lead.cs
│   ├── Exhibition.cs
│   └── Employee.cs
│
├── DTOs/
│   └── ExtractionDTOs.cs
│
├── Data/
│   └── DbConnection.cs           Dapper connection factory
│
├── Utils/
│   └── UtcDateTimeConverter.cs
│
└── database/
    └── 001_create_database.sql   Full schema + seed data (run once)
```

---

## API Reference

### Authentication
```
POST /api/auth/login
     Body : { "email": "...", "password": "..." }
     Returns : employee info + role + permissions array
```

### Card Extraction
```
POST /api/extraction/card/preview    Extract data without saving (user reviews first)
POST /api/extraction/card/confirm    Save confirmed lead to database
POST /api/extraction/voice           Transcribe audio + analyse with OpenAI
```

### Leads
```
GET    /api/leads                    Paginated — filters: exhibition_id, status_code,
                                     source_code, segment, priority, limit, offset
GET    /api/leads/{id}
POST   /api/leads
PUT    /api/leads/{id}
DELETE /api/leads/{id}
GET    /api/leads/search             ?name=...
POST   /api/leads/{id}/push-to-crm
POST   /api/leads/{id}/smart-message
```

### Exhibitions
```
GET    /api/exhibitions
POST   /api/exhibitions
PUT    /api/exhibitions/{id}
DELETE /api/exhibitions/{id}         Soft delete (IsActive = 0)
```

### Analytics
```
GET /api/analytics/summary                  ?exhibition_id=
GET /api/analytics/employee-performance     ?exhibition_id=
GET /api/analytics/exhibitions
```

### Users & Roles
```
GET    /api/users
POST   /api/users
PUT    /api/users/{id}
GET    /api/roles
POST   /api/roles
PUT    /api/roles/{id}
```

### System
```
GET /health
GET /swagger
```

---

## Key Technical Details

### JSON Serialisation
- All responses use `snake_case` naming (`SnakeCaseLower` policy)
- DateTimes stored as UTC; frontend displays in local time

### Authentication
- No JWT — SHA256 password hash stored in `Employees.PasswordHash`
- `NULL` RoleId on an employee = full admin access (no restrictions)

### Card Extraction Pipeline
1. Image sent to Google Cloud Vision → raw OCR text
2. OCR text sent to OpenAI GPT-4o-mini → structured JSON
3. Duplicate detection via SQL similarity scoring (phone / email / company)
4. Lead auto-segmented by designation keywords
5. User reviews and confirms → lead saved to database

### Data Storage
- Lead contact arrays (phones, emails, addresses, etc.) stored as JSON columns on the `Leads` table
- Uploaded files served from `/uploads/cards/` and `/uploads/audio/`
- File size limits: 20 MB (images), 50 MB (audio)

### Role-Based Access Control
- Permissions stored as a JSON array in `Roles.Permissions`
- Frontend reads the permissions array on login and guards each route
- Salesperson role: `["scan_cards"]` — all other pages redirect to `/chat`

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Google credentials not found` | Place the credentials JSON in `ELCS.API/` and set `CredentialsPath` in `appsettings.json` |
| `Database connection failed` | Verify the connection string; ensure SQL Server is running |
| `OpenAI error` | Check the API key and your account quota |
| Port conflict | Change `Urls` in `appsettings.json` |
