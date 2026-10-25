# intalent Joining Assurance

*Every offer deserves a successful Day 1.*

An AI-powered companion that keeps candidates engaged between offer acceptance and Day 1, confirms their joining plans, and alerts recruiters when someone needs help. It's built so it can ship as a module inside the intalent Agentic Hiring OS, as a standalone product connected to any ATS or HRIS through its API and webhooks, or as a self-serve web app for product-led growth.

This repository implements the **MVP** from the product brief (§13):

| MVP capability | Where |
|---|---|
| Offer-to-join candidate tracking | Candidates list and detail pages, CSV import, `POST /api/v1/candidates` |
| Automated WhatsApp/email engagement | `src/lib/channels` (Meta WhatsApp Cloud API, Twilio WhatsApp/SMS, Resend email), `src/lib/engine/dispatcher.ts` |
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
cp .dev.vars.example .dev.vars   # local secrets; defaults work for development
npm run setup                    # create the local D1 database and load the demo workspace
npm run dev                      # http://localhost:3000
```

Sign in with **demo@acme.test / demo1234**, or create a new workspace at `/signup`.

Without channel credentials, outbound messages are recorded as **simulated**, so the whole product can be tried end to end:
- On a candidate page, use **"Test: reply as …"** to play the candidate and watch the companion respond, flag concerns and update readiness.
- Use **Open candidate view** to see the candidate's mobile joining page and chat as them.
- **Run scheduler now** (top bar) processes any engagements that are due.

`npm run preview` builds the app and runs it on Cloudflare's local Workers runtime (`http://localhost:8787`), which is closer to production than `npm run dev`.

## Configuration

The app runs on **Cloudflare Workers** with a **D1** (SQLite) database bound as `DB` (see `wrangler.jsonc`). Set values locally in `.dev.vars`; in production use `npx wrangler secret put NAME` or the Cloudflare dashboard (Worker → Settings → Variables and Secrets). No redeploy is needed after changing a secret.

| Name | Purpose |
|---|---|
| `AUTH_SECRET` | Session signing secret (32+ characters). **Required.** |
| `APP_URL` | Public base URL, used for candidate links and Twilio signature validation. **Required.** |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Turns on the Claude-powered companion (default model `claude-opus-5-5`, low effort, server-side refusal fallback). Without a key, the rules engine is used. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Outbound email via [Resend](https://resend.com). `EMAIL_FROM` must use a domain verified in Resend. |
| `INBOUND_EMAIL_SECRET` | Shared secret for the inbound email webhook (`?secret=`). |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Meta WhatsApp Cloud API. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` | Twilio WhatsApp / SMS. |
| `CRON_SECRET` | Optional. Only needed to call `/api/cron/tick` from outside; Cron Triggers call it in-process. |

**Inbound webhooks:** `/api/webhooks/whatsapp` (Meta), `/api/webhooks/twilio` (WhatsApp and SMS), `/api/webhooks/email` (Resend, SendGrid, Postmark or Mailgun inbound; JSON or form data).

> WhatsApp note: outside Meta's 24-hour service window, business-initiated messages must use pre-approved templates. Register your journey messages as templates before going live.

**Scheduled engagements** run on Cloudflare **Cron Triggers** (`wrangler.jsonc`): every 5 minutes for due messages, plus an hourly readiness sweep. `worker.ts` handles them by calling `/api/cron/tick` inside the Worker.

## Deploying to Cloudflare

Deployment uses **Cloudflare Workers Builds**: Cloudflare builds and deploys every push to `main`, and other branches get preview URLs. GitHub Actions (`.github/workflows/ci.yml`) only runs the checks.

Requires the **Workers Paid** plan ($5/month); the free plan's 10 ms CPU limit is too low for password hashing and AI reply handling.

### One-time setup
1. **Database:** already created (`pofu`, primary location eastern North America) and referenced in `wrangler.jsonc`. To recreate it: `npx wrangler d1 create pofu --location enam`, then put the new `database_id` into `wrangler.jsonc`.
2. **Connect the repo:** Cloudflare dashboard → Workers & Pages → Create → Import a repository → `IntalentAI/POFU`, then set:
   - Build command: `npm ci && npm test && npx opennextjs-cloudflare build`
   - Deploy command: `npx wrangler d1 migrations apply pofu --remote && npx opennextjs-cloudflare deploy`
3. **Set the secrets** on the Worker:
   ```bash
   openssl rand -base64 48 | npx wrangler secret put AUTH_SECRET
   npx wrangler secret put APP_URL        # e.g. https://pofu.<your-subdomain>.workers.dev
   ```
4. **Optional demo data:** `npm run db:seed && npm run db:seed:remote` loads the Acme demo workspace into production.

You can also deploy by hand with `npm run deploy`, which runs the remote migrations, then builds and deploys.

### Schema changes
Edit `prisma/schema.prisma`, then generate the next D1 migration from the difference with your local database:
```bash
npm run db:diff > migrations/0002_describe_change.sql
npm run db:migrate:local
```
Workers Builds applies new migrations to production on the next deploy.

### Things to know
- **D1 has no multi-statement transactions.** Prisma runs nested writes (for example a journey together with its steps) as separate statements. The app is written so that this doesn't matter.
- **Backups:** D1 Time Travel can restore the database to any minute in the last 30 days (`npx wrangler d1 time-travel restore pofu --timestamp=…`).
- **Data location:** the database's primary copy is in the US (eastern North America). Read replication is off, so data isn't copied to other regions.

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
src/lib/channels/ WhatsApp (Meta/Twilio) · SMS (Twilio) · email (Resend) · simulated mode
src/app/(app)/    recruiter app: Command Center, Candidates, Calendar, Analytics, Journeys, Settings
src/app/j/        candidate joining page (mobile-first, no login, tokenised link)
src/app/api/      integration API, cron tick, channel webhooks
worker.ts         Worker entry: the Next.js app plus the Cron Trigger handler
migrations/       D1 migrations (applied by wrangler)
```

Stack: Next.js 15 (App Router, server actions) on Cloudflare Workers via OpenNext, D1 with Prisma's D1 adapter, TypeScript, Tailwind CSS 4, and the Anthropic SDK.

## Scripts

`npm run dev` · `npm run preview` (local Workers runtime) · `npm run deploy` · `npm test` (engine unit tests) · `npm run typecheck` · `npm run lint` · `npm run setup` · `npm run db:seed` · `npm run db:diff`

## Next (Phase 2 per brief)
Candidate portal with documentation tracking, hiring-manager welcome videos, AI voice check-ins, native HRMS/HCM connectors, a voice command interface for recruiters, and multilingual journeys.
