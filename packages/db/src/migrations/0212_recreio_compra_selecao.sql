CREATE TABLE "recreio"."purchase_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	"product_id" text NOT NULL,
	"profile_reference" uuid NOT NULL,
	"profile_id" uuid,
	"policy_version" integer NOT NULL,
	"coverage_enabled" boolean NOT NULL,
	CONSTRAINT "recreio_purchase_selection_profile" UNIQUE("purchase_id","profile_reference"),
	CONSTRAINT "recreio_purchase_selection_identity" CHECK ("recreio"."purchase_profiles"."policy_version">=1 and ("recreio"."purchase_profiles"."profile_id" is null or "recreio"."purchase_profiles"."profile_id"="recreio"."purchase_profiles"."profile_reference"))
);
--> statement-breakpoint
ALTER TABLE "recreio"."billing_contracts" DROP CONSTRAINT "recreio_billing_contract_selection_review";--> statement-breakpoint
ALTER TABLE "recreio"."billing_contracts" ADD COLUMN "purchase_selection_processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recreio"."purchase_profiles" ADD CONSTRAINT "purchase_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."purchase_profiles" ADD CONSTRAINT "recreio_purchase_selection_scope" FOREIGN KEY ("purchase_id","group_id","payer_user_id","provider_mode","product_id") REFERENCES "recreio"."purchase_authorizations"("id","group_id","payer_user_id","provider_mode","product_id") ON DELETE restrict ON UPDATE no action;