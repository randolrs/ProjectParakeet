-- opportunities and ingest_runs are trusted-access only: written and read by
-- server-side batch jobs over the Drizzle (postgres-role) connection, which
-- bypasses RLS. Enable RLS with NO policies so the anon/authenticated Supabase
-- clients are denied by default.
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ingest_runs" ENABLE ROW LEVEL SECURITY;
