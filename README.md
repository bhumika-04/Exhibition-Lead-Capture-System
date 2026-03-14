# Exhibition Lead Capture System (ELCS)

A lead management system for capturing and managing visitor information at exhibitions using visiting card scanning, voice notes, and WhatsApp greeting integration.

## Architecture

- **Backend:** ASP.NET Core 8 (C#)
- **Frontend:** Next.js 14 (React + TypeScript)
- **Database:** Microsoft SQL Server + Dapper (micro-ORM)
- **OCR:** Google Cloud Vision API
- **Voice:** Google Cloud Speech-to-Text
- **AI:** OpenAI GPT-4o-mini
- **Background Jobs:** Hangfire
- **WhatsApp:** Interakt API (outgoing greetings only)
- **Logging:** Serilog

## Features

- **Visiting Card Scanning** - OCR + AI extraction (front & back)
- **Voice Notes** - Record and transcribe discussion summaries
- **Duplicate Detection** - Smart duplicate lead identification
- **Lead Segmentation** - Auto-categorization (decision_maker, influencer, researcher, general)
- **Priority Assignment** - AI-based priority (high, medium, low)
- **WhatsApp Greeting** - One-time greeting sent to lead on card confirmation
- **Analytics Dashboard** - Real-time metrics and insights
- **Exhibition Management** - Multiple exhibitions support
- **Lead Management** - Filters, search, edit, CRUD

## Quick Start

### Prerequisites

1. .NET 8 SDK
2. Node.js 18+
3. SQL Server 2019+
4. Google Cloud account (Vision API + Speech-to-Text)
5. OpenAI API key

### 1. Database Setup

```sql
CREATE DATABASE ELCS;
GO
-- Run: backend-dotnet/database/001_create_database.sql
-- Run: backend-dotnet/database/002_seed_essential_data.sql
```

Default admin credentials:
- Email: `admin@example.com`
- Password: `admin123`

### 2. Backend Setup

```bash
cd backend-dotnet/ELCS.API

# Download Tesseract data (one-time)
mkdir tessdata && cd tessdata
curl -LO https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
cd ..

# Update appsettings.json with your credentials
# Run
dotnet restore && dotnet run
```

Backend runs at: `http://localhost:5008`
Swagger UI: `http://localhost:5008/swagger`
Hangfire Dashboard: `http://localhost:5008/hangfire`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: `http://localhost:3000`

## Configuration

### Backend (appsettings.json)

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR_SERVER\\SQLEXPRESS;Database=ELCS;Integrated Security=True;TrustServerCertificate=True;"
  },
  "OpenAI": {
    "ApiKey": "sk-your-openai-api-key",
    "Model": "gpt-4o-mini"
  },
  "WhatsApp": {
    "ApiUrl": "https://api.interakt.ai/v1",
    "ApiKey": "your-interakt-api-key-base64",
    "PhoneNumber": "your-connected-number"
  },
  "GoogleVision": {
    "CredentialsPath": "elcs-vision-service-XXXXX.json"
  }
}
```

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5008
```

## Project Structure

```
ExhibitionVistingCard/
├── backend-dotnet/
│   └── ELCS.API/
│       ├── Controllers/
│       │   ├── AuthController.cs
│       │   ├── ExtractionController.cs
│       │   ├── LeadsController.cs
│       │   ├── ExhibitionsController.cs
│       │   ├── AnalyticsController.cs
│       │   └── WhatsAppController.cs   # outgoing greeting only
│       ├── Services/
│       ├── Models/
│       ├── Data/
│       └── uploads/
│           ├── cards/
│           ├── audio/
│           └── documents/
│
└── frontend/
    └── app/
        ├── page.tsx              → redirect to /chat
        ├── chat/page.tsx         → card scanning (main flow)
        ├── leads/page.tsx        → lead list + filters
        ├── leads/[id]/page.tsx   → lead detail + edit
        ├── exhibitions/page.tsx  → exhibition CRUD
        ├── dashboard/page.tsx    → analytics
        └── auth/login/page.tsx   → login
```

## Usage Flow

### 1. Scan Visiting Card
1. Login → go to Scan tab
2. Select exhibition
3. Upload front card image (saved to server immediately)
4. Optionally upload back side
5. Wait for OCR + AI extraction (~10–20 sec)
6. Review extracted details, correct if needed
7. Click **Confirm** → lead created + WhatsApp greeting sent

### 2. Record Voice Note
1. Click microphone icon on scan page
2. Record discussion summary
3. System transcribes and extracts: segment, priority, next step, company name
4. Review and confirm

### 3. Manage Leads
- Go to **Leads** tab — filter by status, source, exhibition, segment, priority
- Click a lead → view details, edit, send WhatsApp greeting manually

### 4. Analytics
- **Dashboard** tab — total leads, lead sources, exhibitions, recent activity, upcoming meetings

## API Endpoints

### Authentication
- `POST /api/auth/login`

### Card Extraction
- `POST /api/extraction/upload-card-image` — immediate image save
- `POST /api/extraction/card/preview` — extract without creating lead
- `POST /api/extraction/card/confirm` — confirm + create lead
- `POST /api/extraction/voice` — voice note analysis

### Leads
- `GET /api/leads` — list with filters
- `GET /api/leads/{id}` — lead detail
- `POST /api/leads` — create
- `PUT /api/leads/{id}` — update
- `DELETE /api/leads/{id}` — delete
- `POST /api/leads/{id}/send-greeting` — send WhatsApp greeting

### Exhibitions
- `GET /api/exhibitions` — list
- `POST /api/exhibitions` — create
- `PUT /api/exhibitions/{id}` — update
- `DELETE /api/exhibitions/{id}` — soft delete

### Analytics
- `GET /api/analytics/summary`
- `GET /api/analytics/employee-performance`

## Deployment

- **Frontend:** Vercel (`frontend/vercel.json` configured)
- **Backend:** IIS on Windows Server
- **Deployed at:** `https://exhibitionvistingcard.vercel.app`

## Security Notes

- No JWT — simplified auth for internal use (SHA256 password hash, localStorage flag)
- CORS configured for localhost + Vercel URLs
- SQL injection protected by Dapper parameterization
- 20MB limit on card images, 50MB on audio

## Performance

| Metric | Value |
|--------|-------|
| Cold Start | 1–2s |
| Memory | ~150MB |
| OCR Processing | 10–20s |
| API Latency | 10–30ms |

## Common Issues

**Google Cloud API errors** — ensure JSON key file exists, Vision and Speech APIs are enabled.

**Database connection failed** — check connection string and SQL Server service is running.

**OpenAI rate limit** — check quota at platform.openai.com.

**Port in use** — backend port configured in `appsettings.json` under `Urls`.
