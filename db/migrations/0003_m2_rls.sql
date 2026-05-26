-- Owner-scoped RLS for the M2 tables, matching the M1 pattern.
ALTER TABLE "bid_profile" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "company_enrichment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "bid_profile_select_own" ON "bid_profile"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "bid_profile_insert_own" ON "bid_profile"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "bid_profile_update_own" ON "bid_profile"
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint

CREATE POLICY "enrichment_select_own" ON "company_enrichment"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "enrichment_insert_own" ON "company_enrichment"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "enrichment_update_own" ON "company_enrichment"
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
