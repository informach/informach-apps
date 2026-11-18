CREATE TABLE "recreio"."trial_claims" (
	"payer_user_id" text PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"entitlement_kind" text DEFAULT 'trial' NOT NULL,
	"entitlement_tier" text DEFAULT 'family' NOT NULL,
	"cohort" text NOT NULL,
	"policy_version" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_trial_claim_kind" CHECK ("recreio"."trial_claims"."entitlement_kind" = 'trial'),
	CONSTRAINT "recreio_trial_claim_tier" CHECK ("recreio"."trial_claims"."entitlement_tier" = 'family'),
	CONSTRAINT "recreio_trial_claim_cohort" CHECK ("recreio"."trial_claims"."cohort" in ('48h', '7d')),
	CONSTRAINT "recreio_trial_claim_policy" CHECK (length("recreio"."trial_claims"."policy_version") between 2 and 64),
	CONSTRAINT "recreio_trial_claim_duration" CHECK (
      ("recreio"."trial_claims"."cohort" = '48h' and "recreio"."trial_claims"."ends_at" = "recreio"."trial_claims"."starts_at" + interval '48 hours') or
      ("recreio"."trial_claims"."cohort" = '7d' and "recreio"."trial_claims"."ends_at" = "recreio"."trial_claims"."starts_at" + interval '168 hours')
    )
);
--> statement-breakpoint
CREATE TABLE "recreio"."trial_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payer_user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"adult_declaration_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "recreio_trial_enrollment_identity" UNIQUE("id","group_id","payer_user_id","policy_version"),
	CONSTRAINT "recreio_trial_enrollment_policy" CHECK (length("recreio"."trial_enrollments"."policy_version") between 2 and 64),
	CONSTRAINT "recreio_trial_enrollment_declaration" CHECK (length("recreio"."trial_enrollments"."adult_declaration_version") between 2 and 64),
	CONSTRAINT "recreio_trial_enrollment_withdrawal" CHECK ("recreio"."trial_enrollments"."withdrawn_at" is null or "recreio"."trial_enrollments"."withdrawn_at" >= "recreio"."trial_enrollments"."accepted_at")
);
--> statement-breakpoint
ALTER TABLE "recreio"."trial_claims" ADD CONSTRAINT "recreio_trial_claim_enrollment" FOREIGN KEY ("enrollment_id","group_id","payer_user_id","policy_version") REFERENCES "recreio"."trial_enrollments"("id","group_id","payer_user_id","policy_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."trial_claims" ADD CONSTRAINT "recreio_trial_claim_entitlement_identity" FOREIGN KEY ("entitlement_id","group_id","entitlement_kind","entitlement_tier","starts_at","ends_at") REFERENCES "recreio"."entitlements"("id","group_id","kind","tier","starts_at","ends_at") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."trial_enrollments" ADD CONSTRAINT "recreio_trial_enrollment_payer" FOREIGN KEY ("group_id","payer_user_id") REFERENCES "recreio"."groups"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_trial_claim_group" ON "recreio"."trial_claims" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_trial_claim_entitlement" ON "recreio"."trial_claims" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_trial_enrollment_active" ON "recreio"."trial_enrollments" USING btree ("payer_user_id") WHERE "recreio"."trial_enrollments"."withdrawn_at" is null;