# Project Parakeet — Status

_Last updated: 2026-05-26_

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
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qlifjviffrdihehncqcj.supabase.co` | ready |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key (provided to founder out-of-band) | ready |
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
