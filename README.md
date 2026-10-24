# intalent Joining Assurance

*Every offer deserves a successful Day 1.*

An AI-powered companion that keeps candidates engaged between offer acceptance and Day 1, confirms their joining plans, and alerts recruiters when someone needs help. It's built so it can ship as a module inside the intalent Agentic Hiring OS, as a standalone product connected to any ATS or HRIS through its API and webhooks, or as a self-serve web app for product-led growth.

This repository implements the **MVP** from the product brief (§13):

| MVP capability | Where |
|---|---|
| Offer-to-join candidate tracking | Candidates list and detail pages, CSV import, `POST /api/v1/candidates` |
| Automated WhatsApp/email engagement | `src/lib/channels` (Meta WhatsApp Cloud API, Twilio WhatsApp/SMS, SMTP), `src/lib/engine/dispatcher.ts` |
| Configurable follow-up schedules | Engagement Journeys (editable steps); adapts to the notice period (`src/lib/engine/schedule.ts`) |
| Two-way candidate conversations | Inbound webhooks plus the candidate joining page `/j/:token`; recruiters can reply from the candidate page |
| Joining-date confirmation | Commitment pulse checks with quick replies, Day-1 arrival check, commitment timeline |
| Candidate concerns detection | `src/lib/ai`: Claude (structured output), with a deterministic rules engine as fallback |
| Recruiter alerts & escalation | Concerns with owner and suggested action, the Attention Required queue, outbound webhooks |
| Joining calendar | `/calendar` |
| Basic joining analytics | `/analytics`: conversion, readiness, dropout reasons, and breakdowns by recruiter, department, location and source |

### Product guardrails (from the brief)
- The AI never negotiates pay, approves date changes, makes commitments or pressures candidates. It acknowledges the request and escalates it, and the recruiter approves.
- Answers come only from **employer-approved knowledge** (Settings → Approved answers). Unknown questions are escalated.
- Readiness is **explainable and rules-based** (On track / Needs attention / Intervention required), and every status is shown with the indicators behind it. Silence alone never raises "Intervention required".
- Frequency is personalised: optional touchpoints are skipped for candidates who are clearly on track, and pulse checks aren't repeated right after a confirmation.
- Quiet hours, opt-out (`STOP`), AI disclosure, an "always reach a person" option, and a no-documents-in-chat rule.
- Engagement stops immediately when a candidate joins, drops out or has their offer rescinded. Changing the joining date rebuilds the schedule.

## Quick start

```bash
npm install
cp .env.example .env        # defaults work for local development
npm run setup               # create the SQLite DB and seed the demo workspace
npm run dev                 # http://localhost:3000
```

Sign in with **demo@acme.test / demo1234**, or create a new workspace at `/signup`.

Without channel credentials, outbound messages are recorded as **simulated**, so the whole product can be tried end to end:
- On a candidate page, use **"Test: reply as …"** to play the candidate and watch the companion respond, flag concerns and update readiness.
- Use **Open candidate view** to see the candidate's mobile joining page and chat as them.
- **Run scheduler now** (top bar) processes any engagements that are due.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite by default. For production, set `provider = "postgresql"` in `prisma/schema.prisma` and use a Postgres URL. |
| `AUTH_SECRET` | Session signing secret (32+ characters). **Required in production.** |
| `APP_URL` | Public base URL, used for candidate links and Twilio signature validation. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Turns on the Claude-powered companion (default model `claude-opus-5-5`, low effort, server-side refusal fallback). Without a key, the rules engine is used. |
| `SMTP_URL`, `EMAIL_FROM` | Outbound email. |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Meta WhatsApp Cloud API. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | Twilio WhatsApp / SMS. |
| `INBOUND_EMAIL_SECRET` | Shared secret for the inbound email webhook (`?secret=`). |
| `ENABLE_INTERNAL_SCHEDULER` | `true` runs the scheduler every minute inside the server process (single instance). |
| `CRON_SECRET` | Protects `/api/cron/tick` for external schedulers (serverless or multi-instance). |

**Inbound webhooks:** `/api/webhooks/whatsapp` (Meta), `/api/webhooks/twilio` (WhatsApp and SMS), `/api/webhooks/email` (SendGrid, Postmark or Mailgun inbound, JSON or form data).

> WhatsApp note: outside Meta's 24-hour service window, business-initiated messages must use pre-approved templates. Register your journey messages as templates before going live.

## Integration API

Create an API key under Settings → API & webhooks.

```
POST  /api/v1/candidates          enroll on offer acceptance (idempotent on externalId)
GET   /api/v1/candidates          ?status=&readiness=
GET   /api/v1/candidates/:id      id or externalId
PATCH /api/v1/candidates/:id      { joiningDate, notifyCandidate, status: joined|dropped|offer_rescinded, reason }
```

Outbound webhook events (HMAC-SHA256 signature in `x-intalent-signature`): `candidate.enrolled`, `candidate.confirmed`, `candidate.readiness_changed`, `candidate.joining_date_changed`, `candidate.status_changed`, `concern.raised`, `concern.resolved`.

## Architecture

```
src/lib/engine/   schedule (adaptive journey planner) · dispatcher (sends due engagements)
                  inbound (understand → act → reply) · readiness (explainable status) · actions
src/lib/ai/       Claude interpreter (structured output) · rules fallback · shared schema
src/lib/channels/ WhatsApp (Meta/Twilio) · SMS (Twilio) · email (SMTP) · simulated mode
src/app/(app)/    recruiter app: Command Center, Candidates, Calendar, Analytics, Journeys, Settings
src/app/j/        candidate joining page (mobile-first, no login, tokenised link)
src/app/api/      integration API, cron tick, channel webhooks
```

Stack: Next.js 15 (App Router, server actions), TypeScript, Tailwind CSS 4, Prisma, and the Anthropic SDK.

## Scripts

`npm run dev` · `npm run build` · `npm test` (engine unit tests) · `npm run typecheck` · `npm run lint` · `npm run db:seed`

## Next (Phase 2 per brief)
Candidate portal with documentation tracking, hiring-manager welcome videos, AI voice check-ins, native HRMS/HCM connectors, a voice command interface for recruiters, and multilingual journeys.
