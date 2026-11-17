ALTER TABLE "family"."access_grants" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "family"."app_profiles" ADD COLUMN "delegation_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "family"."access_grants" ADD CONSTRAINT "access_grants_id_unique" UNIQUE("id");