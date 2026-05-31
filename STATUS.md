# Project Parakeet — Status

_Last updated: 2026-05-29_

## Current milestone: M4 — Digest pipeline (CODE COMPLETE, needs Resend keys to send live)

### Done (code + DB)
- Schema: `digests` + `digest_entries` tables (Drizzle; migrations 0007/0008 applied live).
  Owner-scoped SELECT on both; UPDATE-own on entries (for `user_disposition`); writes via the
  trusted Drizzle path. `digest_entries` snapshots `opportunity_hash` + `bid_profile_version`
  so scoring cache can re-score only on input change.
- Per-user eligibility filter (`lib/digest/eligibility.ts`): pure function over a normalized
  opportunity + a profile. Rules: NAICS pool, set-asides (open competitions always pass; substring
  match for vendor formatting variance), notice types, agency exclusions, place-of-performance
  (handles SAM `{state:{code}}` shape, nationwide, defers on unknown POP), deadline-passed.
  Aggregates ALL failing reasons (lossy reasons hide bugs). 20 unit tests.
- Candidate selection (`lib/digest/candidates.ts`): SQL pre-filter (jurisdiction, active, deadline,
  in-scope notice types) + in-memory eligibility application. `dropCounts` keyed by reason for
  observability. CandidateOpportunity omits `raw_data` from the SELECT (hundreds of KB per row,
  never read by the pipeline). 4 tests.
- Lazy description fetch (`lib/digest/descriptions.ts`): gated by eligibility (already done by
  step above), `maxFetches` default 100/run (CLAUDE.md cost discipline), per-fetch failure
  isolation, cache to `opportunities.description_text` + bump `last_fetched_at`. 6 tests.
- Per-opp scoring (`lib/digest/scoring.ts` + `lib/llm/prompts/federal/opportunity-scoring.ts`):
  Haiku 4.5, forced tool-use (`record_opportunity_score`) producing
  `{fit_score, bid_recommendation, reasoning_text, key_factors}`. Prompt explicitly targets the
  competitor gap — scores against the M2 tacit-judgment fields (walk-away signals, incumbent
  appetite, teaming, effort/P(win)). Award Notices NEVER score "bid". Cache key
  (user, opp, opportunity_hash, bid_profile_version): a profile bump OR an upstream opp change
  forces re-score. Sequential calls for prompt-cache (ephemeral) hit on shared system block.
  13 tests across prompt + scoring orchestrator.
- Digest synthesis (`lib/digest/synthesis.ts` + `lib/llm/prompts/federal/digest-synthesis.ts`):
  deterministic ranking (drop no_bid; order by recommendation tier → fit_score → deadline asc),
  then bump <72h deadlines to the top. Single Sonnet 4.6 call writes a 2-3 sentence TL;DR header
  for the email (the only cross-opp signal); per-opp reasoning came from Haiku. 9 tests.
- HTML+text render (`lib/digest/render.ts`): mobile-first single column, inline styles only,
  color-coded recommendation, deadline label adapts to runway, HTML escapes all source-supplied
  text. Plain-text fallback. 8 tests.
- Resend wrapper (`lib/email/resend-client.ts`): raw fetch (no SDK), retry/timeout/logging via
  shared `fetchJson`, Zod-validated response. `RESEND_FROM_EMAIL` configurable so the first proof
  can use Resend's sandbox sender (`onboarding@resend.dev`) before a domain verifies.
- End-to-end orchestrator (`lib/digest/generate.ts`): wires all the above through injectable
  seams. DrizzleDigestStore idempotent on (user, date) so re-runs reuse the row.
  `findUsersDueForDigest` matches users on `digest_delivery_hour == UTC hour AND no digest yet
  today (or last attempt failed)`. 5 tests.
- Admin button: `runDigestNow` server action + `AdminDigestButton` component (gated by
  `FOUNDER_EMAIL`, same shape as the M3 ingest button).
- Hourly Vercel Cron (`vercel.json`) → `GET /api/cron/digest`, Bearer `CRON_SECRET`; processes
  each due user sequentially within the 60s function timeout.

### Blocked — needs founder action (to send live)
1. Add `RESEND_API_KEY` to Vercel.
2. Add `RESEND_FROM_EMAIL` to Vercel — either a verified-domain sender (e.g.
   `Parakeet <digest@yourdomain>`) or Resend's sandbox sender `onboarding@resend.dev` for the
   first proof. Sandbox sender only delivers to the account owner's email.
3. Click "Run digest now" on `/dashboard` and confirm the email lands; check `digests` /
   `digest_entries` populated. (No new Vercel env beyond Resend; ANTHROPIC_API_KEY,
   GOVCONAPI_KEY, CRON_SECRET, FOUNDER_EMAIL already set from M2/M3.)

### M4 acceptance criteria
- [x] Eligibility filter: unit-tested (20 tests), pure function — fast enough to run over 50k rows
- [x] Lazy description fetch wired (eligibility-gated, cached, capped, failure-isolated)
- [x] Per-opportunity scoring with Haiku, cached on (user, opp, opportunity_hash, profile_version)
- [x] Digest synthesis (deterministic rank + Sonnet TL;DR header)
- [ ] First test digest delivered to founder via Resend
- [ ] Founder-verified

### Next
Founder adds `RESEND_API_KEY` + `RESEND_FROM_EMAIL` to Vercel; click "Run digest now" and confirm
the email + DB rows. Then M4 closes and M5 (Stripe checkout, paywall, single tier) begins.

## Milestone M3 — Daily ingest (COMPLETE, founder sign-off 2026-05-29)

### Done (code + DB)
- `opportunities` + `ingest_runs` tables (Drizzle; migrations 0005/0006 applied). RLS enabled
  deny-by-default — trusted-access only, written/read over the Drizzle (postgres-role) connection,
  never the browser clients.
- Centralized, date-windowed, paginated, budget-aware ingest (`lib/opportunities/ingest.ts`) behind
  an injectable store: reads `source.capabilities.requestBudget`, caps pages/run, dedupes by
  `raw_data_hash` (new/updated/unchanged), logs each run to `ingest_runs`. Unit-tested with a fake
  source + store.
- GovConAPI real implementation (`lib/opportunities/sources/govconapi-source.ts`): Bearer auth,
  ISO date window, defensive Zod parser (only requires `notice_id` + `title`; everything else via
  safe coercions so unexpected shapes like `psc: []`/`psc: 'R425'` don't reject a batch).
  `descriptionsInline: false` (verified live 2026-05-28: only Award Notices inline `description_text`;
  Solicitation / Combined / Sources Sought / Special have it null with `description_url` only —
  same cost shape as SAM direct). `fetchDescription` falls back to the `/opportunities/{id}` detail
  endpoint, spending GovConAPI budget.
- Bulk upsert in `DrizzleIngestStore.upsertOpportunities`: 1 SELECT for existing hashes + 1 bulk
  INSERT + K updates for changed + 1 bulk UPDATE touching `last_fetched_at` on unchanged. Reduced
  a 50-record page from ~100 SQL round-trips to ~3; full 15-page run completes in ~8s well inside
  Vercel's 60s function timeout.
- Trust source pagination: `OpportunitySource.search` returns `{ items, hasNext }` and we drive
  pagination off `hasNext`, not item count (so the GovConAPI Free-tier 50/page cap can't truncate).
  Regression test included.
- Daily Vercel Cron (`vercel.json`, 06:00 UTC) -> `GET /api/cron/ingest`, guarded by `CRON_SECRET`.
- Admin "Run ingest now" button on `/dashboard` for the founder (gated by `FOUNDER_EMAIL`).
- `app/dashboard/error.tsx` error boundary so a failed action doesn't surface Next's last-resort
  "Application error" overlay.
- `lib/db.ts` made lazy (`getDb()`) so importing it never throws at build when `DATABASE_URL` absent.

### Founder config (done)
- `OPPORTUNITY_SOURCE=govconapi`, `GOVCONAPI_KEY`, `CRON_SECRET`, `FOUNDER_EMAIL` set in Vercel.

### M3 acceptance criteria
- [x] Cron pulls active federal opportunities into Postgres via the active source
- [x] Budget-aware (reads source capabilities; per-run page cap; logged in `ingest_runs`)
- [x] Descriptions present per source capability (GovConAPI inline for Award Notices today;
      lazy-fetch path implemented and verified — proper invocation gated by eligibility lands in M4)
- [x] Verified live (manual runs through the admin button populated 790 distinct rows across two
      one-day windows; pagination drove `hasNext=true` for 15 pages × 50 records in ~8s)
- [x] Founder-verified (2026-05-29)

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
