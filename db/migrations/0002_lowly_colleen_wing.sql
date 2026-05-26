CREATE TABLE "bid_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability_summary" text,
	"won_setups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"walk_away_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"differentiators" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"incumbent_displacement_appetite" text,
	"teaming_posture" text,
	"response_effort_tolerance" text,
	"experience_level" text,
	"raw_conversation_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bid_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "company_enrichment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"website_url" text NOT NULL,
	"raw_markdown" text,
	"extracted" jsonb,
	"source" text DEFAULT 'firecrawl' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_enrichment_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "bid_profile" ADD CONSTRAINT "bid_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_enrichment" ADD CONSTRAINT "company_enrichment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;