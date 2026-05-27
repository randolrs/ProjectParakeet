import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Schema is the single source of truth; migrations are generated from it.
// User-facing access goes through the Supabase client (RLS-enforced); Drizzle
// owns schema/migrations and trusted server-side jobs in later milestones.

// App-level profile, 1:1 with auth.users. The auth.users FK + the trigger that
// seeds this row on signup live in the hand-written RLS migration (auth.users
// is not a Drizzle-managed table).
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  timezone: text('timezone').notNull().default('America/New_York'),
  digestDeliveryHour: integer('digest_delivery_hour').notNull().default(7),
  jurisdictions: text('jurisdictions')
    .array()
    .notNull()
    .default(sql`ARRAY['federal']::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const companyPreferences = pgTable('company_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Certifications the company HOLDS (granted). certs_pursuing are in-progress.
  certifications: text('certifications').array().notNull().default(sql`ARRAY[]::text[]`),
  certsPursuing: text('certs_pursuing').array().notNull().default(sql`ARRAY[]::text[]`),
  primaryNaics: text('primary_naics').array().notNull().default(sql`ARRAY[]::text[]`),
  secondaryNaics: text('secondary_naics').array().notNull().default(sql`ARRAY[]::text[]`),
  pscCodes: text('psc_codes').array().notNull().default(sql`ARRAY[]::text[]`),
  // Free-text capability keywords (how vendors actually search), e.g. "helpdesk".
  keywords: text('keywords').array().notNull().default(sql`ARRAY[]::text[]`),
  // GSA Schedule, GWAC, IDIQ, BPA, ...
  contractVehicles: text('contract_vehicles').array().notNull().default(sql`ARRAY[]::text[]`),
  // Eligible set-asides, derived from certs_granted and optionally widened.
  setAsideTypes: text('set_aside_types').array().notNull().default(sql`ARRAY[]::text[]`),
  // Where the company CAN perform: { states: string[], remote: bool, nationwide: bool }.
  placeOfPerformance: jsonb('place_of_performance')
    .notNull()
    .default(sql`'{"states":[],"remote":false,"nationwide":false}'::jsonb`),
  // Where the company IS located (principal office) — drives HUBZone / local preference.
  hqState: text('hq_state'),
  // Contract value appetite as a range (USD). value_band kept only for back-compat.
  valueMin: bigint('value_min', { mode: 'number' }),
  valueMax: bigint('value_max', { mode: 'number' }),
  valueBand: text('value_band'),
  // Size inputs — small/large is derived against the primary NAICS size standard.
  annualRevenueUsd: bigint('annual_revenue_usd', { mode: 'number' }),
  employeeCount: integer('employee_count'),
  // Readiness: active SAM registration + UEI.
  samRegistered: boolean('sam_registered').notNull().default(false),
  hasUei: boolean('has_uei').notNull().default(false),
  role: text('role'),
  agenciesOfInterest: text('agencies_of_interest').array().notNull().default(sql`ARRAY[]::text[]`),
  agenciesExcluded: text('agencies_excluded').array().notNull().default(sql`ARRAY[]::text[]`),
  noticeTypes: text('notice_types').array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Captured tacit bid/no-bid judgment from the M2 conversation. The judgment
// fields (won_setups .. response_effort_tolerance) are what a website cannot
// supply and the per-opportunity scoring later reasons against.
export const bidProfiles = pgTable('bid_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  capabilitySummary: text('capability_summary'),
  wonSetups: jsonb('won_setups').notNull().default(sql`'[]'::jsonb`),
  walkAwaySignals: jsonb('walk_away_signals').notNull().default(sql`'[]'::jsonb`),
  differentiators: jsonb('differentiators').notNull().default(sql`'[]'::jsonb`),
  incumbentDisplacementAppetite: text('incumbent_displacement_appetite'),
  teamingPosture: text('teaming_posture'),
  responseEffortTolerance: text('response_effort_tolerance'),
  experienceLevel: text('experience_level'),
  rawConversationLog: jsonb('raw_conversation_log').notNull().default(sql`'[]'::jsonb`),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Cached company-website crawl + LLM extraction. Cached so onboarding never
// re-crawls a site (cost discipline); refreshed only on explicit re-run.
export const companyEnrichment = pgTable('company_enrichment', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  websiteUrl: text('website_url').notNull(),
  rawMarkdown: text('raw_markdown'),
  // { naics: string[], psc: string[], capabilitySummary: string, differentiators: string[] }
  extracted: jsonb('extracted'),
  source: text('source').notNull().default('firecrawl'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
});

// Centrally-ingested federal opportunities (the daily pull). Not user-scoped:
// per-user filtering/scoring runs server-side over the trusted Drizzle
// connection, so RLS is enabled with NO authenticated policies (deny-by-default
// to the browser clients).
export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jurisdiction: text('jurisdiction').notNull().default('federal'),
    externalNoticeId: text('external_notice_id').notNull(),
    solicitationNumber: text('solicitation_number'),
    title: text('title').notNull(),
    department: text('department'),
    subTier: text('sub_tier'),
    office: text('office'),
    noticeType: text('notice_type').notNull(),
    naicsCode: text('naics_code'),
    pscCode: text('psc_code'),
    setAsideType: text('set_aside_type'),
    postedDate: timestamp('posted_date', { withTimezone: true }),
    responseDeadline: timestamp('response_deadline', { withTimezone: true }),
    placeOfPerformance: jsonb('place_of_performance'),
    descriptionUrl: text('description_url'),
    descriptionText: text('description_text'),
    pointOfContact: jsonb('point_of_contact'),
    award: jsonb('award'),
    rawData: jsonb('raw_data').notNull(),
    rawDataHash: text('raw_data_hash').notNull(),
    firstFetchedAt: timestamp('first_fetched_at', { withTimezone: true }).notNull().defaultNow(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [unique('opportunities_jurisdiction_external_id_unique').on(t.jurisdiction, t.externalNoticeId)],
);

// One row per ingest run: window, requests consumed (budget tracking), and
// upsert counts. Trusted-access only, like opportunities.
export const ingestRuns = pgTable('ingest_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),
  jurisdiction: text('jurisdiction').notNull().default('federal'),
  status: text('status').notNull().default('running'),
  windowFrom: timestamp('window_from', { withTimezone: true }),
  windowTo: timestamp('window_to', { withTimezone: true }),
  requestsConsumed: integer('requests_consumed').notNull().default(0),
  opportunitiesUpserted: integer('opportunities_upserted').notNull().default(0),
  opportunitiesNew: integer('opportunities_new').notNull().default(0),
  descriptionsFetched: integer('descriptions_fetched').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

