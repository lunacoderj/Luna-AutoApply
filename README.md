<p align="center">
  <img src="client/public/logo.png" width="200" alt="Luna Logo">
</p>

# ApplyPilot (Luna)

**Autonomous Internship Discovery & Application Platform**

A unified full-stack app merging InternshipAI (Apify scraper + email) with Internship-Apply-Bot (Supabase + BullMQ + Playwright AI) into a single production-ready product.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Vite + React PWA  (client/)        │
│  Landing · Auth · Dashboard         │
│  Education · AI Keys · Preferences  │
└──────────────┬──────────────────────┘
               │ Bearer (Firebase JWT)
┌──────────────▼──────────────────────┐
│  Express API  (backend/)            │
│  Firebase Auth → Supabase user_id   │
│  /api/user /keys /internships ...   │
└────────┬──────────────────┬─────────┘
         │ Supabase Postgres │ BullMQ → Redis
         └──────────────────┘
              3 Workers
          scrapeWorker   ← Apify
          applyWorker    ← Playwright + AI
          resumeWorker   ← AI PDF parse
```

---

## Quick Start

### 1. Supabase — Run migrations

Open **Supabase → SQL Editor** and paste the contents of `backend/migrations.sql`.

Also create a storage bucket named **`applypilot`** (private).

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in all values in .env
npm install
npm run dev
```

### 3. Client

```bash
cd client
cp .env.example .env
# Fill VITE_FIREBASE_* and VITE_API_URL
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Environment Variables

### `backend/.env`

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key (with `\n`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `REDIS_URL` | Redis connection string |
| `RESEND_API_KEY` | Resend API key for emails |
| `EMAIL_FROM` | Sender address (e.g. `ApplyPilot <notify@yourdomain.com>`) |
| `ENCRYPTION_KEY` | AES-256 key — **exactly 32 characters** |
| `FRONTEND_URL` | Client URL for CORS (production) |

### `client/.env`

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL (e.g. `http://localhost:3000`) |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

---

## User Setup Flow

1. **Sign up** (email/password, Google, or GitHub)
2. **AI Keys** → Add Apify key + Gemini or OpenRouter key
3. **Education** → Upload resume PDF (AI auto-fills) or fill manually
4. **Preferences** → Create preference sets (roles, locations, interval)
5. **Dashboard** → Click "Scrape Now" for instant test, or wait for 12h auto-cycle

---

## Autonomous Pipeline

```
Every 12 hours (configurable per set):
  scrapeWorker
    → Decrypt Apify key from DB
    → Run Apify Google Search Scraper
    → Upsert results to internships table
    → Send styled HTML email report (Resend)
    → Enqueue apply jobs → applyQueue

  applyWorker (concurrency: 2)
    → Fetch education_details + AI keys
    → Generate AI cover letter (OpenRouter/Gemini)
    → Playwright navigates to job URL
    → AI fills form fields step-by-step
    → Update applications table (success/failed)
    → Batch email apply report after 30 min

  resumeWorker (triggered on upload)
    → Extract PDF text (pdfjs-dist)
    → AI parses → education_details table
    → Update onboarding_status
```

---

## Deployment (Railway)

1. Push to GitHub
2. Create two Railway services: **backend** and **client** (static)
3. Add a Redis service in Railway
4. Set all env vars in Railway dashboard
5. Install Playwright: `npx playwright install chromium` (add to Dockerfile)

### Dockerfile (backend)

```dockerfile
FROM node:20-slim
RUN npx playwright install-deps chromium && npx playwright install chromium
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

---

## Project Structure

```
Luna_InternshipAI/
├── backend/
│   ├── migrations.sql
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── lib/          (firebase-admin, supabase, redis, crypto, logger)
│       ├── middleware/   (auth, errorHandler, rateLimiter)
│       ├── routes/       (user, keys, preferences, education, resume, internships, applications, emailLogs)
│       ├── services/     (scraperService, aiService, automationService, emailService)
│       ├── queues/       (scrapeQueue, applyQueue, resumeQueue)
│       └── workers/      (scrapeWorker, applyWorker, resumeWorker, index)
└── client/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── firebase.js
        ├── index.css      (dark glassmorphism design system)
        ├── context/       (AuthContext)
        ├── services/      (api.js — axios + Firebase token)
        ├── components/    (Layout, Navbar, StatCard, InternshipCard, ApplicationRow, KeyCard, ProtectedRoute)
        └── pages/         (Landing, Auth, Dashboard, Education, AIKeys, Preferences, Profile)