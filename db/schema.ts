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
