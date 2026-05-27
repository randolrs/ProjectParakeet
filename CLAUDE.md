# Operating Context

## What This Is
Personalized AI morning digest for government contractors. Read SPEC.md for product context. This file is HOW you work, not WHAT we're building.

## Operating Style
- Read SPEC.md before any non-trivial change
- Working software over abstractions; v1 ships in 4-8 weeks
- Server Components by default; Client Components only when interactivity is required
- Database access via Supabase server client only — never expose service keys to the browser
- Every external API call: retry + timeout + structured logging
- Tests for: digest generation, scoring, opportunity ingest, LLM output parsing, billing webhooks. Not for UI scaffolding.

## Conventions
- TypeScript strict mode; no `any`. Use `unknown` and parse if uncertain.
- Zod at every boundary: opportunity-source responses, USAspending responses, LLM outputs, internal routes, form inputs
- Domain folders: `/lib/opportunities`, `/lib/digest`, `/lib/onboarding`, `/lib/billing`, `/lib/llm`
- LLM prompts in `/lib/llm/prompts/{jurisdiction}/*.ts` as exported consts — never inline
- Drizzle schema in `/db/schema.ts`, migrations in `/db/migrations/`, checked into git
- One commit per logical change; conventional commit messages
- Server actions for mutations; route handlers only when external systems POST in (Stripe webhooks, Resend webhooks, cron)

## Decisions Already Made (don't relitigate)
- Next.js App Router (not Pages)
- Supabase for Postgres + Auth
- Drizzle ORM, migrations checked in
- Anthropic API (not OpenAI)
- Federal first, SLED deferred to M7+
- Jurisdiction is first-class in the schema even though only federal ships in v1
- v1 notice scope expanded 2026-05 (founder decision) to six types (see SPEC.md): the four actionable + Special Notices (early-stage shaping) and Award Notices (teaming/recompete intel — labeled as such, not bid targets); justifications/intent-to-bundle/surplus still out
- Single pricing tier at launch ($149/mo)
- Web only, no mobile app
- Resend for email
- Haiku 4.5 for routine per-opportunity scoring, Sonnet 4.6 for conversational onboarding and digest reasoning
- Opportunity data behind an `OpportunitySource` interface; GovConAPI is the v1 primary, SAM.gov direct is the fallback, selected by `OPPORTUNITY_SOURCE` env. Both are built and tested in M0.

## When to Ask Before Acting
- Adding any dependency over 50kb
- Adding a new external service
- Schema changes after M3 ships
- Anything touching Stripe, auth, or an opportunity source's ToS / rate-limit posture
- Anything that changes a "Decisions Already Made" item
- Any change to LLM prompts that materially shifts digest tone or bid/no-bid methodology

## When NOT to Ask
- Component file structure inside a domain
- Tailwind class choices
- Naming of internal functions/variables
- Tests for code you just wrote
- Refactors that don't change the public interface

## Jurisdiction Handling
Jurisdiction is first-class even though only federal ships in v1. Treat it like region/timezone — every opportunity has one, every user has one or more.

- Every user has `jurisdictions: text[]` defaulting to `['federal']`
- Every opportunity has `jurisdiction: text not null`
- Every digest is jurisdiction-scoped
- LLM prompts live in `/lib/llm/prompts/federal/*.ts` (sled directory exists, stays empty in v1)
- A `JurisdictionStrategy` interface in `/lib/opportunities/jurisdictions.ts` abstracts: data fetch, opportunity normalization, vocabulary, default digest delivery hour, eligibility rules. Only Federal ships in v1; SLED stub exists but throws.

If you write federal-specific logic outside `/lib/opportunities/jurisdictions/federal/` or `/lib/llm/prompts/federal/`, stop and refactor through the interface.

## The Data-Source Model & Cost Discipline (load-bearing)
One principle holds for BOTH sources and is non-negotiable:

- FATAL: per-user live queries against any source. With more than a handful of users you exhaust any budget.
- CORRECT: one centralized daily pull, date-windowed, paginated, stored in Postgres. All per-user filtering and scoring happens in-DB and in the LLM, never against the live source.

Everything else is source-specific and MUST be read from `source.capabilities`, never hardcoded:

- **Descriptions.** If `capabilities.descriptionsInline` is true (GovConAPI), `search()` already carries the text — do nothing extra. If false (SAM direct), descriptions are a separate fetch per opportunity and the real budget pressure: fetch only for opportunities matching ≥1 active user's eligibility filter; cache permanently; re-fetch only on `raw_data_hash` change; track count in `ingest_runs` and defer past a safe ceiling.
- **Request budget.** Read `capabilities.requestBudget`. The ingest scheduler respects whatever the active source reports — GovConAPI's per-hour ceiling or SAM's per-day ceiling — without code changes. Log consumed requests every run regardless of source.
- **Migration.** Swapping GovConAPI → SAM direct is an env flip plus the SAM impl conforming to the interface (built in M0). No downstream change. If the user base outgrows SAM's 1,000/day, the path is a federal system account (10,000/day) — flag it, don't silently degrade.

LLM cost model (source-independent):
- Pre-filter aggressively in Postgres (NAICS, set-aside eligibility, agency, value band, place of performance) before any LLM call
- Target: ≤15-25 opportunities per user per day reach LLM scoring
- Cache LLM analysis of an opportunity for the life of that opportunity (re-score only on modification)
- Haiku 4.5 for per-opportunity scoring; Sonnet 4.6 only for final digest synthesis and conversational onboarding
- Track per-user LLM spend; alert if any user exceeds $5/mo at $149 ARPU

## Federal Contracting Vocabulary (use consistently in code, prompts, UI)
- Certifications: 8(a), WOSB, EDWOSB, SDVOSB, VOSB, HUBZone, SDB
- Set-aside types: Total Small Business, Partial Small Business, 8(a) Sole Source, 8(a) Competitive, WOSB, EDWOSB, SDVOSB, HUBZone, full and open
- Notice types (v1 in-scope, expanded 2026-05): Sources Sought/RFI, Presolicitation, Combined Synopsis/Solicitation, Solicitation, Special Notice, Award Notice (ordered early-stage first)
- NAICS: the primary filtering spine; opportunities carry one NAICS, companies carry several
- PSC: Product Service Code; secondary classifier
- Value bands: micro-purchase (≤$10k), simplified acquisition threshold (≤$250k), above SAT, large
- Roles: prime, subcontractor, both
- Key bid/no-bid concepts used in reasoning: incumbent presence, set-aside fit, NAICS size standard fit, past-performance relevance, response effort vs P(win), teaming requirement, place-of-performance fit, deadline runway

## Opportunity Sources
Implementations live in `/lib/opportunities/sources/`. Each conforms to `OpportunitySource` and normalizes at its own boundary with Zod. Source-specific shapes never leak past the implementation.

### GovConApiSource (v1 primary)
- Bearer-token auth: `Authorization: Bearer ${GOVCONAPI_KEY}`
- Returns `description_text` inline → `descriptionsInline: true`
- ~1,000/hour throughput on the dev tier; `requestBudget: { perHour: 1000 }`
- KNOWN RISK to keep in view: this is a small third-party vendor reselling free public data. Treat it as scaffolding for speed, not a permanent dependency. Read their ToS for any no-competing/no-derivative-service clause; if present, SAM direct is the true production source.

### SamDirectSource (fallback)
- Base: https://api.sam.gov/prod/opportunities/v2/search
- Auth: `api_key` QUERY param (not header) — `SAM_API_KEY`
- Date window: `postedFrom`/`postedTo` mm/dd/yyyy; pagination `limit` (≤1000) + `offset`
- Returns description URL, not text → `descriptionsInline: false`, fetch separately and budget it
- `requestBudget: { perDay: 1000 }` once entity-role granted (10 until then)
- Public-domain, redistributable; stay within rate limits; don't present as official SAM.gov

### USAspending (enrichment, both modes)
Open API, no key, generous. "Who won similar work?" for incumbent context in bid/no-bid reasoning. Best-effort: if it fails, the digest still ships.

## Competitive Intel
Mindy / GovCon Giants is the dominant direct competitor, distribution-moated via Eric Coffie's audience. Founder subscribes for two weeks during M0-M2. M2 prompt design should target what Mindy's structured-filter qualification misses — specifically tacit bid/no-bid judgment. Do not copy their copy or UX. Read their output, design against the gap. Remember: the product gap is closeable; their distribution is not closeable by this codebase.

## Milestone Gating
At the end of every milestone: tests pass, deployed to Vercel preview, founder-verified against acceptance criteria, STATUS.md updated, STOP and request review. Don't run the next milestone's work while the current is incomplete.

## What Done Looks Like
A working state deployed to Vercel preview, milestone acceptance criteria manually verified, STATUS.md committed.
