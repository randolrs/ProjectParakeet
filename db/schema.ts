import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
  certifications: text('certifications').array().notNull().default(sql`ARRAY[]::text[]`),
  primaryNaics: text('primary_naics').array().notNull().default(sql`ARRAY[]::text[]`),
  secondaryNaics: text('secondary_naics').array().notNull().default(sql`ARRAY[]::text[]`),
  pscCodes: text('psc_codes').array().notNull().default(sql`ARRAY[]::text[]`),
  setAsideTypes: text('set_aside_types').array().notNull().default(sql`ARRAY[]::text[]`),
  // { states: string[], remote: boolean, nationwide: boolean }
  placeOfPerformance: jsonb('place_of_performance')
    .notNull()
    .default(sql`'{"states":[],"remote":false,"nationwide":false}'::jsonb`),
  valueBand: text('value_band'),
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

