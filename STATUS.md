# Project Parakeet — Status

_Last updated: 2026-05-25_

## Current milestone: M0 — Foundations & data-source spike

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
  is live and verified rendering (HTTP 200): `https://project-parakeet-i2wqttzzo-randolrs-projects.vercel.app`.
  Every push to the branch now auto-deploys.

### Blocked — needs founder action
- **Server secrets are not retrievable via MCP.** Supabase does not expose the database
  password (`DATABASE_URL`) or the `service_role` key after project creation. Founder to copy
  them from the Supabase dashboard (Settings -> Database / Settings -> API) into Vercel and
  local `.env`.

### Env wiring status
| Var | Source | State |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qlifjviffrdihehncqcj.supabase.co` | ready |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key (provided to founder out-of-band) | ready |
| `DATABASE_URL` | Supabase dashboard -> Settings -> Database (pooled :6543 for app, direct :5432 for migrations) | founder |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard -> Settings -> API | founder |
| `OPPORTUNITY_SOURCE`, `GOVCONAPI_KEY`, `SAM_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `CRON_SECRET`, `FOUNDER_EMAIL` | see `.env.example` | later milestones |

### M0 acceptance criteria
- [x] App skeleton builds and runs
- [x] Hosted Postgres reachable
- [ ] `DATABASE_URL` connects via `npm run db:check` (pending DB password)
- [x] Deployed to Vercel preview
- [ ] Founder-verified

### Next
Founder adds the two server secrets (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) to Vercel
and local `.env`; then re-run `npm run db:check` to close out the last M0 criterion.
Cosmetic follow-up: the page still renders the literal `[PRODUCT_NAME]` placeholder — swap in
the real product name before any external sharing.
