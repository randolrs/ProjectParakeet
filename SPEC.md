# [PRODUCT_NAME]

## Product
Personalized AI morning digest for government contractors. Users tell us their company profile through structured onboarding plus a short LLM-driven conversation that captures their bid/no-bid judgment. We pull every active federal opportunity daily, score each against the user's profile, and deliver a digest of the opportunities worth pursuing — with bid/no-bid reasoning they can verify.

Not a raw SAM.gov search wrapper. Not a "here's every NAICS match" firehose. A personalized capture analyst that respects how the user actually decides what to bid.

## Audience (v1)
Certified small-business federal contractors (8(a), WOSB/EDWOSB, SDVOSB, HUBZone) who actively pursue federal work, file 1+ proposals per month, and currently spend hours per week triaging SAM.gov by hand or paying for a tool that dumps NAICS matches on them. They know their capabilities cold. They want triage that thinks like they do, not another search alert.

[PRODUCT_NAME] is for contractors who already know how to win, and want the find-and-qualify work done with them, not for them.

## Competitive Reality (read this before believing the rest)
The binding constraint on this business is **distribution, not product.**

- **Mindy / GovCon Giants** (govcongiants.com, Eric Coffie) ships a near-identical bid/no-bid + opportunity-scoring product at ~$149/mo, fronted by a large, trusting audience of certified small-business owners. That audience is the moat. It is not a product moat — it is a distribution moat, and **no feature in this spec neutralizes it.**
- This spec makes a better *product*. It does not make a better *business* on its own. The wedge below (conversational bid/no-bid capture) is real product differentiation, but out-producting an influencer does not beat their distribution. Winning requires a distribution answer this document does not contain: a niche Mindy doesn't serve well (a single agency, a single certification, a single NAICS vertical), an owned channel, or a partner with the audience.
- Decide the distribution wedge before M6. If the honest answer is "I'll run ads against an influencer's warm audience head-to-head," expect that to be expensive and slow. That's a known, deliberately-accepted risk per the founder's learning-vehicle frame — not an oversight.

Confidence that the product is buildable: high. Confidence that the product alone wins the market: low. Those are different claims and this spec only delivers the first.

## The Wedge
Direct competitors (Mindy, and the broader category of GovCon "opportunity intelligence" tools) qualify opportunities through **structured filters**: NAICS, set-aside, agency, value. Filters capture eligibility. They do not capture judgment — the tacit sense of "this one's worth a proposal and that one's a trap" that experienced capture managers carry in their heads.

[PRODUCT_NAME]'s differentiator is a short conversation that captures that judgment into a `bid_profile`, then scores opportunities against it. Same architectural bet as a personalized analyst: the conversation is the product. It is necessary differentiation. It is not sufficient for distribution (see above).

## Jurisdiction Coverage (v1)
Federal only, via the active opportunity source. State & Local (SLED) is the planned expansion path and is a first-class concept in the schema, but no SLED ingest ships in v1.

## Notice Scope (v1) — quality over firehose
In scope (expanded 2026-05; was the four actionable types only): Sources Sought / RFI, Presolicitation, Combined Synopsis/Solicitation, Solicitation, Special Notice, Award Notice. The middle ones are directly biddable; Sources Sought/RFI and Special Notices let a small vendor shape early-stage requirements (often the highest-value notice); Award Notices feed teaming-target and recompete intel.

Explicitly out of v1: Justification & Approval, Intent to Bundle, Fair Opportunity / Limited Sources Justification, Sale of Surplus Property. Also out: opportunities with no future response deadline, and long-running IDIQ/BOA vehicles that the source does not surface as recently posted/modified.

Rationale: every line should be something the user can act on — bid, shape early, or pursue via teaming/recompete. Award Notices are included for the teaming/recompete play, not as bid targets, and the digest must label them as such.

## Core User Flow
1. Land → email capture for first free digest, or signup with email + password
2. Deterministic onboarding form: certifications held, primary + secondary NAICS, PSC codes (optional), set-aside types willing to pursue, place-of-performance willingness (states / remote / nationwide), contract value band, prime / sub / both, agencies of interest, agencies to exclude
3. Conversational onboarding (4-6 LLM-driven open questions): captures tacit bid/no-bid judgment → structured `bid_profile` JSON. This is the wedge.
4. Daily cron: pull active federal opportunities (new + modified since last run) via the active source, store in Postgres, ensure description text is present for opportunities matching any active user (inline if the source provides it, lazily fetched + cached otherwise)
5. Per-user filter (eligibility) + LLM score (fit + bid/no-bid reasoning) → digest
6. Email delivery at user's specified time (default 7 AM user-local). Digest = new matches since last digest + deadline-approaching opportunities not yet dispositioned.
7. In-app disposition per opportunity (pursuing / passed / watching) refines the profile over time

## Stack (decided — identical to the racing build, don't relitigate)
- Framework: Next.js 15 App Router + TypeScript strict
- DB: Supabase Postgres (auth + RLS + pgvector reserved for capability embeddings post-M6)
- ORM: Drizzle (migrations checked in)
- Auth: Supabase Auth (email + password)
- Email: Resend
- Payments: Stripe (Payment Links acceptable for MVP, integrated checkout at M5)
- LLM: Anthropic API. Haiku 4.5 for routine per-opportunity scoring; Sonnet 4.6 for conversational onboarding and digest reasoning
- Hosting: Vercel
- Cron: Vercel Cron
- Data: OpportunitySource abstraction — GovConAPI (v1) and SAM.gov direct (fallback), both normalized; USAspending.gov for enrichment
- Observability: Vercel logs + Resend alerts on cron failures

## Data Sources (source-agnostic by design)
Opportunity data is accessed through an `OpportunitySource` interface with two interchangeable implementations, selected by the `OPPORTUNITY_SOURCE` env var. All downstream code consumes a normalized, jurisdiction-tagged `NormalizedOpportunity` type and never sees a source's raw shape.

- **GovConAPI (v1 primary, `OPPORTUNITY_SOURCE=govconapi`)**: paid intermediary over SAM.gov data. ~$19/mo dev tier, Bearer-token auth, higher throughput (~1,000/hour), and **returns description text inline** — which removes the separate per-opportunity description fetch entirely. Chosen to bootstrap with zero registration lead time.
- **SAM.gov direct (fallback, `OPPORTUNITY_SOURCE=sam`)**: authoritative, free, public-domain federal data. `api_key` query-param auth. 10/day until entity registration grants the 1,000/day role. Returns a description **URL**, not text — descriptions are a separate, budgeted fetch.
- **USAspending.gov** (orthogonal, both modes): open, no key, used for incumbent / prior-award enrichment. Best-effort.

Rationale for two: GovConAPI gives immediate momentum; SAM direct gives dependency-free, ToS-clean, free-at-scale production. Founder runs SAM entity registration in parallel during M0-M2; migration is an env flip once it clears (see CLAUDE.md). The abstraction makes the source a reversible decision, not a bet.

## Milestones
- **M0 — Skeleton**: Next.js + Supabase + Drizzle scaffold, env wired, OpportunitySource abstraction with BOTH implementations (GovConAPI + SAM direct) built and tested against real APIs, USAspending client, JurisdictionStrategy interface (Federal impl, SLED stub). Founder signs up for GovConAPI (instant), starts SAM.gov entity registration (multi-week, in parallel), and subscribes to Mindy / GovCon Giants for two weeks to feel the gap.
- **M1 — Auth + deterministic onboarding**: Supabase auth, structured company-profile form, `company_preferences` persisted, RLS in place
- **M2 — Conversational onboarding**: LLM flow produces `bid_profile` JSON. Prompts informed by competitive intel from the Mindy subscription.
- **M3 — Daily ingest**: cron pulls active federal opportunities into Postgres via the active source, budget-aware, descriptions present per source capability
- **M4 — Digest pipeline**: filter + score + bid/no-bid reasoning + render + email to founder as first test user
- **M5 — Billing**: Stripe checkout, paywall, single tier
- **M6 — Launch**: production deploy, distribution wedge decided and executed, first paying customer
- **M7+ — Scale**: SLED expansion, proposal-assist adjacency, teaming/partner matching, exclusions (debarment) screening

Stop at the end of every milestone. Don't start the next until the current is deployed, verified, and STATUS.md is updated.

## Pricing (v1)
Single tier: $149/mo (matching Mindy) or $1,490/yr. First digest free, no card.

Pricing note: matching the incumbent's price while lacking the incumbent's distribution is a known-weak position. It is the founder's deliberate choice. Revisit at M6 — a lower price into an underserved niche, or a higher price for a sharper vertical, both beat undifferentiated price-matching.

## Non-Goals (v1)
- SLED, state, local opportunities (architecture supports, ingest disabled)
- Proposal writing / generation (M7+ adjacency)
- Teaming / partner matchmaking
- Exclusions / debarment screening (separate endpoint, M7+)
- Mobile app (web only, mobile-responsive)
- Multi-jurisdiction in one digest
- CRM features, pipeline management beyond simple disposition

## Constraints
- Single founder, evenings/weekends
- GovConAPI key is instant; SAM.gov direct's 1,000/day requires entity registration (~2-3 wks) — start it in parallel at M0
- Whatever source is active, respect its request budget (see CLAUDE.md cost model)
- No PII beyond email and company profile
- No payment data stored locally (Stripe-hosted only)
- Env includes `OPPORTUNITY_SOURCE` (default `govconapi`), `GOVCONAPI_KEY`, `SAM_API_KEY`

## Key Data Structures (defined in M1-M2, summarized here)
- `users`: id, email, timezone, digest_delivery_hour, jurisdictions (default `['federal']`), created_at
- `company_preferences`: user_id, certifications[], primary_naics[], secondary_naics[], psc_codes[], set_aside_types[], place_of_performance[], value_band, role (prime/sub/both), agencies_of_interest[], agencies_excluded[], notice_types[]
- `bid_profile`: user_id, capability_summary, won_setups[], walk_away_signals[], incumbent_displacement_appetite, teaming_posture, differentiators[], response_effort_tolerance, experience_level, raw_conversation_log, version, updated_at
- `opportunities`: id, jurisdiction, external_notice_id, solicitation_number, title, department, sub_tier, office, notice_type, naics_code, psc_code, set_aside_type, posted_date, response_deadline, place_of_performance jsonb, description_url, description_text (nullable, lazily fetched when source doesn't inline it), point_of_contact jsonb, award jsonb (nullable), raw_data jsonb, raw_data_hash, first_fetched_at, last_fetched_at, is_active
- `digest_entries`: id, user_id, opportunity_id, digest_date, rank, fit_score, bid_recommendation (bid/no_bid/watch), reasoning_text, key_factors jsonb, response_deadline, sent_at, user_disposition
- `digests`: id, user_id, digest_date, sent_at, status

## What "Done" Looks Like
Each milestone ends with: passing tests for its scope, deployed to Vercel preview, manually verified by founder, STATUS.md committed with what shipped and what was verified.
