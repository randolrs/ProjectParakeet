# Project Parakeet — Status

_Last updated: 2026-05-26_

## Current milestone: M1 — Auth + deterministic onboarding (CODE COMPLETE, runtime blocked on env)

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

### Blocked — needs founder action (preview 500s until done)
1. Add to Vercel env (Production + Preview + Development), then redeploy:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://qlifjviffrdihehncqcj.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_NtoYQSA_OdlJGoTXhNv8jA_a9ITZCah`
   Without these the auth middleware throws `MIDDLEWARE_INVOCATION_FAILED` on every route.
2. Supabase -> Authentication -> URL Configuration: set Site URL to
   `https://project-parakeet.vercel.app` and add redirect `https://project-parakeet.vercel.app/**`
   so the confirm-email link returns to the app. (Or disable "Confirm email" for faster testing.)

### M1 acceptance criteria
- [x] Supabase auth (email + password) implemented
- [x] Structured company-profile form
- [x] `company_preferences` persisted via the RLS-enforced path
- [x] RLS in place (policies + trigger + revoke verified in-DB)
- [ ] Deployed preview functional (blocked on env above)
- [ ] Founder-verified

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
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qlifjviffrdihehncqcj.supabase.co` | value ready; **add to Vercel (M1)** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key `sb_publishable_NtoYQSA_OdlJGoTXhNv8jA_a9ITZCah` | value ready; **add to Vercel (M1)** |
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
