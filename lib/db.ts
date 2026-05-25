import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

// Server-only Supabase Postgres access via Drizzle. Never import this into a
// Client Component. `prepare: false` is required for Supabase's transaction
// pooler (pgbouncer); use the direct connection string for migrations.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

export const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
