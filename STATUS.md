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

### Blocked — needs founder action
- **Vercel deploy.** No Vercel project is linked to `randolrs/projectparakeet` yet, and
  there is no Vercel token in this environment, so the preview can't be triggered from here.
  Founder to import the repo in Vercel (sets up git auto-deploy) or supply a `VERCEL_TOKEN`.
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
- [ ] Deployed to Vercel preview
- [ ] Founder-verified

### Next
Founder completes the Vercel import and adds the two server secrets; then re-run
`npm run db:check` and confirm the preview renders, closing out M0.
