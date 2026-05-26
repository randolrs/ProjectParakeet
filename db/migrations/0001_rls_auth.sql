-- Link public.users to auth.users (auth schema is Supabase-managed, not in the
-- Drizzle schema) and seed a profile row on signup.
ALTER TABLE "users"
  ADD CONSTRAINT "users_id_auth_users_id_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- The function runs only as the signup trigger; deny direct RPC execution so it
-- is not callable via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
--> statement-breakpoint

-- RLS: each row is visible/writable only by its owner. public.users rows are
-- created by the SECURITY DEFINER trigger above, so no INSERT policy is needed.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "company_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "users_select_own" ON "users"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
--> statement-breakpoint
CREATE POLICY "users_update_own" ON "users"
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
--> statement-breakpoint

CREATE POLICY "prefs_select_own" ON "company_preferences"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "prefs_insert_own" ON "company_preferences"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
--> statement-breakpoint
CREATE POLICY "prefs_update_own" ON "company_preferences"
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
