# LeadForge

AI lead-generation platform: type a city + business category, get an analyzed, outreach-ready company list in minutes (see `LeadForge_Analysis_AR.md:6`).

## Pipeline

```
import (Google Places) → enrich (site crawl) → analyze (Gemini) → sales messages
```

1. **import-businesses** — up to 60 Google Places results per city, dedupe, 0–100 Health Score.
2. **enrich-business** — crawls `/`, `/about`, `/contact`, `/services`, `/booking`; extracts phone/email/WhatsApp; 8 detectors (analytics, booking, chatbot, tech stack, pixel, social…).
3. **analyze-business** — unified knowledge profile → Gemini advisory report with Lead Score, strengths/weaknesses/opportunities → priority engine (`priority_score`, `next_action`: CALL / EMAIL / WHATSAPP / IGNORE).
4. **generate-sales** — industry + weakness-matched offer template → email + WhatsApp message + call script + follow-up sequence.

## Stack

- Frontend: React 19 + Vite 8 + TypeScript + Tailwind v4 + TanStack Query + Supabase client (`src/`, 83 files)
- Backend: Supabase (Postgres + ~10 Edge Functions on Deno) + Gemini + Google Places API
- Shared: `supabase/functions/_shared/` — canonical model, repositories, rule engines, rate limiter, cost tracking
- DB: ~18 tables with RLS; dashboard pages: LeadWorkspace, Pipeline, Messages, Import, Reports, Settings, Knowledge Center, Data Inspector

## Run

```bash
npm install
npm run dev
```

Copy `.env.example` → `.env.local` and fill Supabase + Google keys. No `origin` remote configured yet — push is a separate, approved step.
