-- Digests + digest_entries: written by the trusted server job (cron / manual
-- trigger) over the Drizzle (postgres-role) connection, which bypasses RLS.
-- Users read their own through owner-scoped SELECT policies; user_disposition
-- updates flow through an owner-scoped UPDATE policy (the only mutation users
-- ever make to a digest entry).
ALTER TABLE "digests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "digest_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "digests_select_own" ON "digests"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint

CREATE POLICY "digest_entries_select_own" ON "digest_entries"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "digest_entries_update_own" ON "digest_entries"
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
