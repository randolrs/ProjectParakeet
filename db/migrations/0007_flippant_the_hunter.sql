CREATE TABLE "digest_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"fit_score" integer NOT NULL,
	"bid_recommendation" text NOT NULL,
	"reasoning_text" text NOT NULL,
	"key_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"response_deadline" timestamp with time zone,
	"opportunity_hash" text NOT NULL,
	"bid_profile_version" integer NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_disposition" text,
	"dispositioned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_entries_digest_opportunity_unique" UNIQUE("digest_id","opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"digest_date" date NOT NULL,
	"jurisdiction" text DEFAULT 'federal' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"candidates_considered" integer DEFAULT 0 NOT NULL,
	"entries_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digests_user_date_jurisdiction_unique" UNIQUE("user_id","digest_date","jurisdiction")
);
--> statement-breakpoint
ALTER TABLE "digest_entries" ADD CONSTRAINT "digest_entries_digest_id_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_entries" ADD CONSTRAINT "digest_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_entries" ADD CONSTRAINT "digest_entries_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;