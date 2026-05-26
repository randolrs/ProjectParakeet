CREATE TABLE "company_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certifications" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"primary_naics" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"secondary_naics" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"psc_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"set_aside_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"place_of_performance" jsonb DEFAULT '{"states":[],"remote":false,"nationwide":false}'::jsonb NOT NULL,
	"value_band" text,
	"role" text,
	"agencies_of_interest" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"agencies_excluded" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"notice_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"digest_delivery_hour" integer DEFAULT 7 NOT NULL,
	"jurisdictions" text[] DEFAULT ARRAY['federal']::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_preferences" ADD CONSTRAINT "company_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;