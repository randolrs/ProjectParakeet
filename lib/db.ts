import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

// Server-only Postgres access via Drizzle, for TRUSTED batch jobs (ingest,
// scoring) that operate across all users — never for user-scoped reads, which
// go through the RLS-enforced Supabase client. Lazily initialized so importing
// this module never throws at build/import time when DATABASE_URL is absent.
// `prepare: false` is required for Supabase's transaction pooler.
let instance: ReturnType<typeof create> | null = null;

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export function getDb() {
  if (!instance) instance = create();
  return instance;
}
