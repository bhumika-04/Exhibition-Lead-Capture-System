# Exhibition Lead Capture System (ELCS)

A full-stack lead management system for capturing and organising visitor information at trade shows and exhibitions — combining OCR, AI, and voice transcription to automate lead capture from visiting cards.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Flow](#usage-flow)
- [API Reference](#api-reference)
- [Roles & Permissions](#roles--permissions)
- [Deployment](#deployment)
- [Security Notes](#security-notes)

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Backend    | ASP.NET Core (.NET 10), C#               |
| Frontend   | Next.js 14, React 18, TypeScript        |
| Database   | SQL Server 2019+, Dapper (micro-ORM)    |
| OCR        | Google Cloud Vision API                 |
| Voice      | Google Cloud Speech-to-Text             |
| AI         | OpenAI GPT-4o-mini                      |
| Styling    | Tailwind CSS, shadcn/ui, Framer Motion  |
| Logging    | Serilog                                 |

---

## Features

- **Visiting Card Scanning** — OCR + AI extraction with front & back side support
- **Voice Notes** — Record and auto-transcribe discussion summaries
- **Duplicate Detection** — Smart matching via phone, email, and company name
- **Lead Segmentation** — Auto-categorization: decision_maker, influencer, researcher, general
- **Priority Assignment** — AI-based priority: high, medium, low
- **Exhibition Management** — Multiple exhibitions with independent lead sets
- **Lead Management** — Full CRUD with filters, search, and edit
- **Analytics Dashboard** — Real-time metrics, employee performance, lead source breakdown
- **Role-Based Access Control** — Admin, Manager, Salesperson with granular permissions
- **CRM Integration** — Push leads to external CRM/ERP
- **WhatsApp** — Direct `wa.me/` message link from lead detail

---

## Project Structure

```
ExhibitionVistingCard/
├── ExhibitionVistingCard.sln              Visual Studio solution
├── README.md
│
├── backend-dotnet/
│   ├── Directory.Build.props
│   ├── README.md                          Backend-specific docs
│   └── ELCS.API/
│       ├── Program.cs
│       ├── ELCS.API.csproj
│       ├── appsettings.json               Local config (not committed)
│       ├── appsettings.example.json       Template — copy and fill in values
│       │
│       ├── Controllers/
│       │   ├── AuthController.cs          POST /api/auth/login
│       │   ├── ExtractionController.cs    Card OCR + voice extraction
│       │   ├── LeadsController.cs         Lead CRUD
│       │   ├── ExhibitionsController.cs   Exhibition CRUD
│       │   ├── AnalyticsController.cs     Dashboard metrics
│       │   ├── RolesController.cs         Role management
│       │   └── UsersController.cs         User management
│       │
│       ├── Services/
│       │   ├── ExtractionService.cs       OCR pipeline (Vision → OpenAI → save)
│       │   ├── LeadService.cs             Lead CRUD, JSON column parsing
│       │   ├── OpenAIService.cs           Card normalisation, voice analysis
│       │   ├── GoogleVisionOcrService.cs  Google Vision OCR
│       │   ├── GoogleSpeechService.cs     Google Speech-to-Text
│       │   ├── AuthService.cs             SHA256 auth, profile updates
│       │   └── RoleService.cs             Role & permission management
│       │
│       ├── Models/
│       │   ├── Lead.cs
│       │   ├── Exhibition.cs
│       │   └── Employee.cs
│       │
│       ├── DTOs/
│       │   └── ExtractionDTOs.cs
│       │
│       ├── Data/
│       │   └── DbConnection.cs            Dapper connection factory
│       │
│       ├── Utils/
│       │   └── UtcDateTimeConverter.cs
│       │
│       └── database/
│           └── 001_create_database.sql    Full schema + seed data (run once)
│
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── .env.local                         Local env (not committed)
    ├── .env.example                       Template
    │
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                       Redirects to /chat
    │   ├── auth/login/page.tsx
    │   ├── chat/page.tsx                  Card scanning — main flow
    │   ├── leads/page.tsx                 Lead list + filters
    │   ├── leads/[id]/page.tsx            Lead detail + edit
    │   ├── exhibitions/page.tsx           Exhibition CRUD
    │   ├── dashboard/page.tsx             Analytics
    │   ├── report/page.tsx
    │   ├── users/page.tsx
    │   └── roles/page.tsx
    │
    ├── components/
    │   ├── AppShell.tsx
    │   ├── Sidebar.tsx
    │   ├── BottomNav.tsx
    │   ├── CameraCapture.tsx
    │   ├── VoiceRecorder.tsx
    │   └── ui/                            shadcn/ui components
    │
    └── lib/
        ├── api.ts                         Axios API client
        ├── auth.ts                        Auth helpers
        ├── types.ts                       TypeScript interfaces
        └── usePermissionGuard.ts          Permission-based route guard
```

---

## Quick Start

### Prerequisites

- .NET 10 SDK (`net10.0`)
- Node.js 18+
- SQL Server 2019+
- Google Cloud project with **Vision API** and **Speech-to-Text** enabled
- OpenAI API key

---

### 1. Database Setup

Open `backend-dotnet/ELCS.API/database/001_create_database.sql` in SSMS or Azure Data Studio and run it against your SQL Server instance.

The script creates the database, all tables, indexes, default roles, and a default admin account.

| Field    | Value               |
|----------|---------------------|
| Email    | `admin@example.com` |
| Password | `admin123`          |

> Change the admin password after first login.

---

### 2. Backend Setup

```bash
cd backend-dotnet/ELCS.API

# Copy config template and fill in your credentials
cp appsettings.example.json appsettings.json

dotnet restore
dotnet run
```

- API: `http://localhost:5008`
- Swagger UI: `http://localhost:5008/swagger`

---

### 3. Frontend Setup

```bash
cd frontend

cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL

npm install
npm run dev
```

- App: `http://localhost:3000`

---

## Configuration

### Backend — `appsettings.json`

```json
{
  "Urls": "http://localhost:5008",
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

### Frontend — `.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5008
```

---

## Usage Flow

### Scan a Visiting Card

1. Login → go to **Scan** tab
2. Select the active exhibition
3. Upload the front side of the card
4. Optionally upload the back side
5. Wait for OCR + AI extraction (~10–20 sec)
6. Review extracted details, correct if needed
7. Click **Confirm** → lead saved

### Record a Voice Note

1. Tap the microphone icon on the Scan page
2. Record your discussion summary
3. System transcribes and extracts: segment, priority, topics
4. Review and confirm to attach to the lead

### Manage Leads

- **Leads** tab — filter by exhibition, status, source, segment, priority
- Click any lead → view full detail, edit fields, send a WhatsApp message

### Analytics

- **Dashboard** tab — total leads, source breakdown, employee performance, recent activity

---

## API Reference

### Authentication
```
POST /api/auth/login
```

### Card Extraction
```
POST /api/extraction/card/preview    Extract data without saving
POST /api/extraction/card/confirm    Confirm and save as lead
POST /api/extraction/voice           Transcribe and analyse voice note
```

### Leads
```
GET    /api/leads                    Paginated list — filters: exhibition_id, status_code, source_code, segment, priority
GET    /api/leads/{id}
POST   /api/leads
PUT    /api/leads/{id}
DELETE /api/leads/{id}
GET    /api/leads/search             Search by name
POST   /api/leads/{id}/push-to-crm
```

### Exhibitions
```
GET    /api/exhibitions
POST   /api/exhibitions
PUT    /api/exhibitions/{id}
DELETE /api/exhibitions/{id}         Soft delete
```

### Analytics
```
GET /api/analytics/summary                  query: exhibition_id?
GET /api/analytics/employee-performance     query: exhibition_id?
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

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| **Admin** (NULL RoleId) | Full access to all features |
| **Manager** | Scan, Leads, Dashboard, Exhibitions, Reports, CRM Push |
| **Salesperson** | Scan page only |

Permissions are stored as a JSON array on the `Roles` table and checked on every protected frontend route.

---

## Deployment

| Layer    | Platform               |
|----------|------------------------|
| Frontend | Vercel                 |
| Backend  | IIS on Windows Server  |
| Database | SQL Server (self-hosted)|

---

## Security Notes

- No JWT — simplified SHA256 auth for internal use
- CORS restricted to configured origins only
- SQL injection prevented by Dapper parameterisation
- File upload limits: 20 MB (images), 50 MB (audio)
- Salesperson role is hard-restricted to `/chat` — all other routes redirect

---

## Common Issues

| Problem | Fix |
|---------|-----|
| Google Cloud API error | Ensure credentials JSON file exists and Vision/Speech APIs are enabled in your GCP project |
| Database connection failed | Verify connection string and confirm SQL Server service is running |
| OpenAI rate limit | Check quota at platform.openai.com |
| Port conflict | Change `Urls` in `appsettings.json` |

---

*Developed by Bhumika*
