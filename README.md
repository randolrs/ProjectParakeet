# [PRODUCT_NAME]

Personalized AI morning digest for government contractors. See `SPEC.md` for
product context and `CLAUDE.md` for engineering conventions.

> Working name TBD. `[PRODUCT_NAME]` is a placeholder.

## Stack

Next.js 15 (App Router, TypeScript strict) · Tailwind · Supabase Postgres ·
Drizzle ORM · Zod · Anthropic · Resend · Stripe · Vercel.

## Prerequisites

- Node.js 22+
- npm
- A Supabase project (hosted) and/or the Supabase CLI for local config
- Docker (only if you want to run the full local Supabase stack)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

### Supabase

This repo is initialized with the Supabase CLI (`supabase/config.toml`). To run
the full local stack (requires Docker):

```bash
npx supabase start           # boots local Postgres/Auth/etc.
npx supabase stop
```

For most work you can point `DATABASE_URL` at a hosted Supabase project and skip
the local stack entirely.

### Database (Drizzle)

The Drizzle schema lives in `db/schema.ts` (empty until M1); migrations are
generated into `db/migrations/` and checked into git.

```bash
npm run db:check       # verify DATABASE_URL connects to Postgres
npm run db:generate    # generate a migration from schema.ts
npm run db:migrate     # apply migrations
```

> Use the Supabase **direct** connection string (port 5432) for migrations and
> the **pooled** string (port 6543) for the running app.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite (Vitest) |
| `npm run test:watch` | Vitest watch mode |
| `npm run db:check` | Confirm `DATABASE_URL` connects |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |

## Environment variables

Copy `.env.example` and fill in. Service-role and secret keys are server-only —
never expose them to the browser.

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client-safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server-only) |
| `OPPORTUNITY_SOURCE` | `govconapi` (default) or `sam` |
| `GOVCONAPI_KEY` | GovConAPI bearer token |
| `SAM_API_KEY` | SAM.gov API key (query param) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `RESEND_API_KEY` | Resend email API key |
| `STRIPE_SECRET_KEY` | Stripe secret (M5) |
| `CRON_SECRET` | Shared secret for cron route handlers |
| `FOUNDER_EMAIL` | First test recipient |

## Opportunity sources

Opportunity data is accessed through a single `OpportunitySource` interface with
two interchangeable implementations selected by `OPPORTUNITY_SOURCE`. Downstream
code reads `source.capabilities` and never branches on the source name.

**API key provisioning timelines (important):**

- **`GOVCONAPI_KEY` is instant** — sign up for the ~$19/mo dev tier and you have
  a working key immediately. This is the v1 primary source. It returns
  description text inline.
- **`SAM_API_KEY` starts limited** — a fresh SAM.gov key is capped at **10
  requests/day**. It only reaches the production **1,000/day** ceiling after
  **entity registration** clears, which takes roughly **2–3 weeks**. Start that
  registration in parallel at M0; the switch to SAM is then an env flip.

## Deploy

Deploys to Vercel. Set the env vars above in the Vercel project. Preview
deployments are created per branch.
