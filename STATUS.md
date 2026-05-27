# Project Parakeet — Status

_Last updated: 2026-05-27_

## Current milestone: M3 — Daily ingest (CODE COMPLETE, needs source key to run live)

### Done (code + DB)
- `opportunities` + `ingest_runs` tables (Drizzle; migrations 0005/0006 applied). RLS enabled
  deny-by-default — trusted-access only, written/read over the Drizzle (postgres-role) connection,
  never the browser clients.
- Centralized, date-windowed, paginated, budget-aware ingest (`lib/opportunities/ingest.ts`) behind
  an injectable store: reads `source.capabilities.requestBudget`, caps pages/run, dedupes by
  `raw_data_hash` (new/updated/unchanged), logs each run to `ingest_runs`. Unit-tested with a fake
  source + store.
- Daily Vercel Cron (`vercel.json`, 06:00 UTC) -> `GET /api/cron/ingest`, guarded by `CRON_SECRET`.
- `lib/db.ts` made lazy (`getDb()`) so importing it never throws at build when `DATABASE_URL` absent.
- Gates: lint clean, 44 tests pass (3 skipped), build green.

### Blocked — needs founder action (to run live)
1. Add a source key to Vercel: `GOVCONAPI_KEY` (instant; v1 primary) and set
   `OPPORTUNITY_SOURCE=govconapi`. (`SAM_API_KEY` is the fallback — 10/day until entity reg clears.)
2. Add `CRON_SECRET` to Vercel (guards the cron route; Vercel attaches it as the bearer token).
3. Confirm GovConAPI ToS has no no-competing/no-derivative-service clause before relying on it
   (CLAUDE.md known risk); if present, SAM direct is the production source.
   (`DATABASE_URL` is already in Vercel from M0 — the ingest's trusted path uses it.)

### M3 acceptance criteria
- [x] Cron pulls active federal opportunities into Postgres via the active source
- [x] Budget-aware (reads source capabilities; per-run page cap; logged in `ingest_runs`)
- [x] Descriptions present per source capability (GovConAPI inline; SAM lazy-fetch deferred to when SAM is active)
- [ ] Verified live (needs a source key) — manual run + founder check
- [ ] Founder-verified

### Next
Founder adds `GOVCONAPI_KEY` + `OPPORTUNITY_SOURCE` + `CRON_SECRET` to Vercel; then trigger
`/api/cron/ingest` once (with the bearer) or wait for the 06:00 UTC cron, and confirm `opportunities`
rows + an `ingest_runs` row land. Then M4 (digest pipeline: filter + score + bid/no-bid + email) begins.

## Milestone M2 — Conversational onboarding + onboarding rework (COMPLETE, founder sign-off 2026-05-27)

### Done (code + DB)
- Website front door (FireCrawl): optional "paste your site" on `/onboarding` crawls via a
  `CompanyEnrichmentSource` interface (FireCrawl impl, Zod-normalized), then Sonnet 4.6 extracts
  NAICS/PSC/capability_summary/differentiators via structured output. Cached in `company_enrichment`
  (never re-crawled); NAICS/PSC pre-fill the onboarding form.
- Conversational onboarding: 4-question judgment interview (Sonnet 4.6) — walk-away signals,
  incumbent-displacement appetite, teaming posture, effort vs. P(win) — warm-started from the form
  + crawl. Terminates via a strict `record_bid_profile` tool with a forced-extraction fallback so it
  always closes. Persists `bid_profile` via the RLS-enforced client; capability_summary +
  differentiators carried from enrichment.
- Flow: `/onboarding` (form, optionally autofilled) -> `/onboarding/conversation` -> `/dashboard`
  (now shows the captured bid/no-bid profile).
- LLM client wrapper: SDK retry + 60s timeout + structured token/latency logging; prompts as
  reviewed consts in `/lib/llm/prompts/federal`.
- Data model (committed `a460190`): `bid_profile` + `company_enrichment`, owner-scoped RLS, applied.
- Methodology signed off by founder: 4 questions (Q1/won_setups + the adaptive probe out of v1 scope).
- Gates: lint clean, 36 tests pass (3 skipped) incl. LLM-output-parsing + prompt-assembly tests;
  local + Vercel build green.

### Founder config (done)
- `ANTHROPIC_API_KEY` + `FIRECRAWL_API_KEY` added to Vercel.

### M2 acceptance criteria
- [x] LLM flow produces `bid_profile` JSON (validated, persisted)
- [x] Prompts target the gap in the competitor's structured-filter qualification (tacit judgment)
- [x] Deployed preview builds
- [x] Founder-verified (signed off 2026-05-27; reworked onboarding + interview run verified — 4 prefs rows with spine, 4 enrichment rows, 2 completed bid profiles in-DB)

### Next
Founder verifies end-to-end on the preview: paste a company URL -> NAICS/PSC autofill, save
preferences, complete the 4-question interview, confirm the bid/no-bid profile renders on the
dashboard. Then M2 closes and M3 (daily ingest) begins.

### Onboarding rework (2026-05-27) — Persona B spine
Reworked onboarding around **commercial SMBs being pulled into federal** (capability-and-geography
first; codes derived, plain-English-labeled, confirmed not authored), with a fast confirm path for
code-fluent vendors. Shipped: autofill pre-fills real fields (ranked NAICS + labels + size standard,
PSC, keywords, value range); set-asides DERIVED from held certs with contradiction + HUBZone×fully-
remote warnings (pure `lib/onboarding/eligibility.ts`, unit-tested); value as a min-max range;
keywords + contract vehicles; place-of-performance split (perform vs HQ-located) with mobile-first
Remote/Nationwide toggles + collapsed state grid; readiness (SAM/UEI, certs granted vs pursuing);
expanded + explained notice types (early-stage checked by default); broad-by-default with hard-filter
vs ranking-signal labels and "start broad" framing.
Founder decisions: notice scope EXPANDED (Special + Award notices; SPEC.md/CLAUDE.md updated; M3
ingest must pull them); live match-volume DEFERRED to M3 (no fabricated counts — framing only now);
NAICS labels + size standard LLM-DERIVED for now. Schema migration 0004 applied (additive).
Deferred to later milestones: live match count + the Sub/Both Award-Notices teaming feed (need M3
data/ingest); an authoritative SBA size-standard table could later replace the LLM-derived values.

## Milestone M1 — Auth + deterministic onboarding (COMPLETE, founder sign-off 2026-05-26)

### Done (code + DB)
- Supabase email/password auth via `@supabase/ssr`: server/browser clients, middleware
  session refresh + route gating for `/onboarding` and `/dashboard`.
- Sign-up (with confirm-email callback at `/auth/callback`), sign-in, sign-out.
- Schema: `users` (1:1 with `auth.users`) + `company_preferences`. Drizzle is the source of
  truth; migrations checked in (`0000_*`, `0001_rls_auth`) and applied to the live DB via MCP.
- RLS enabled on both tables; owner-scoped policies (`auth.uid()`); `handle_new_user` trigger
  seeds the profile row on signup; direct RPC execute on the function revoked (advisor-clean).
- Deterministic company-profile form persists `company_preferences` through the RLS-enforced
  Supabase client; Zod-validated boundary with a pure, unit-tested form parser.
- Data-access pattern (decided 2026-05-26): Supabase client for user data (real RLS); Drizzle
  owns schema/migrations and future trusted batch jobs.
- Quality gates green: lint clean, 29 tests pass (3 skipped), local + Vercel build succeed
  (commit `e37561d` READY).

### Founder config (done 2026-05-26)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` added to Vercel; preview no longer 500s.
- Supabase Auth Site URL + redirect URLs configured for the confirm-email flow.
- Verified end-to-end after a real signup: the trigger seeded the `users` row and the onboarding
  write landed in `company_preferences` (1 user, 1 prefs row, FK-linked) — RLS write path confirmed.

### M1 acceptance criteria
- [x] Supabase auth (email + password) implemented
- [x] Structured company-profile form
- [x] `company_preferences` persisted via the RLS-enforced path
- [x] RLS in place (policies + trigger + revoke verified in-DB)
- [x] Deployed preview functional (`/login` 200; `/onboarding` gated to `/login`)
- [x] Founder-verified (signed off 2026-05-26)

### Next
M1 complete. Next milestone (M2 — Conversational onboarding): an LLM flow (Sonnet 4.6) that
produces the `bid_profile` JSON, with prompts informed by the Mindy/GovCon Giants competitive
intel. Carry-over: swap the literal `[PRODUCT_NAME]` placeholder before external sharing.

## Milestone M0 — Foundations & data-source spike (COMPLETE, founder sign-off 2026-05-26)

### Done
- Next.js 15 (App Router) + TypeScript strict skeleton; Tailwind v4.
- Drizzle ORM wired (`/db/schema.ts`, `/db/migrations/`, `db:generate` / `db:migrate`).
- `OpportunitySource` contract + `NormalizedOpportunity` Zod schema.
- Quality gates green: lint clean, 22 tests pass (3 skipped), production build succeeds.
- Supabase project provisioned via MCP: **projectparakeet** (ref `qlifjviffrdihehncqcj`,
  region `us-west-1`, free tier). Postgres 17.6 confirmed reachable (`select version()`).
- Project URL: `https://qlifjviffrdihehncqcj.supabase.co`
- Vercel project **project-parakeet** linked to `randolrs/ProjectParakeet` via git integration
  (team `randolrs-projects`). Production deploy of branch `claude/govcon-digest-spec-DMXT9`
  is live at `https://project-parakeet.vercel.app` (renders HTTP 200). The production alias is
  public; per-deployment immutable URLs sit behind Vercel Authentication. Every push auto-deploys.
- `DATABASE_URL` connectivity verified from the deployed runtime: the app's pooled client
  (`lib/db.ts`, transaction pooler :6543, `prepare: false`) connected and returned
  `PostgreSQL 17.6`. Confirmed via a temporary `/api/health` probe, since removed.

### Blocked — needs founder action
- None for M0. `SUPABASE_SERVICE_ROLE_KEY` is not yet wired (not retrievable via MCP) but is
  unused by the v1 scaffold; add it from Supabase -> Settings -> API when the first
  privileged server-side call lands (M1).

### Env wiring status
| Var | Source | State |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qlifjviffrdihehncqcj.supabase.co` | set in Vercel & verified |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key `sb_publishable_NtoYQSA_OdlJGoTXhNv8jA_a9ITZCah` | set in Vercel & verified |
| `DATABASE_URL` | Supabase -> Connect -> Transaction pooler (:6543, `prepare: false`); direct :5432 for migrations | set in Vercel & verified |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard -> Settings -> API | deferred to M1 (unused in v1 scaffold) |
| `OPPORTUNITY_SOURCE`, `GOVCONAPI_KEY`, `SAM_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `CRON_SECRET`, `FOUNDER_EMAIL` | see `.env.example` | later milestones |

### M0 acceptance criteria
- [x] App skeleton builds and runs
- [x] Hosted Postgres reachable
- [x] `DATABASE_URL` connects (verified via deployed runtime; local `npm run db:check` will pass with the same value in `.env`)
- [x] Deployed to Vercel preview
- [x] Founder-verified (signed off 2026-05-26)

### Next
M0 complete and signed off (2026-05-26). Next milestone (M1) begins per SPEC.md.
Carry-overs (not M0 blockers): swap the literal `[PRODUCT_NAME]` placeholder in
`app/layout.tsx` / `app/page.tsx`; wire `SUPABASE_SERVICE_ROLE_KEY` when the first
privileged server-side call lands.
