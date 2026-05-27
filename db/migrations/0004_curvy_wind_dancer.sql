ALTER TABLE "company_preferences" ADD COLUMN "certs_pursuing" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "contract_vehicles" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "hq_state" text;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "value_min" bigint;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "value_max" bigint;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "annual_revenue_usd" bigint;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "sam_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_preferences" ADD COLUMN "has_uei" boolean DEFAULT false NOT NULL;