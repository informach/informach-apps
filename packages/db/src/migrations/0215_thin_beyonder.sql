CREATE TABLE "recreio"."funding_captures" (
	"observation_id" uuid NOT NULL,
	"provider_charge_id" text NOT NULL,
	"amount_captured_cents" bigint NOT NULL,
	"amount_refunded_cents" bigint NOT NULL,
	"disputed" boolean NOT NULL,
	CONSTRAINT "recreio_funding_capture_pk" PRIMARY KEY("observation_id","provider_charge_id"),
	CONSTRAINT "recreio_funding_capture_identity" CHECK (left("recreio"."funding_captures"."provider_charge_id",3)='ch_' and length("recreio"."funding_captures"."provider_charge_id") between 8 and 256),
	CONSTRAINT "recreio_funding_capture_amount" CHECK ("recreio"."funding_captures"."amount_captured_cents" between 1 and 9007199254740991 and "recreio"."funding_captures"."amount_refunded_cents" between 0 and "recreio"."funding_captures"."amount_captured_cents")
);
--> statement-breakpoint
CREATE TABLE "recreio"."funding_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_period_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"purchase_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	"origin_product_id" text NOT NULL,
	"funding_status" text NOT NULL,
	"funded_until" timestamp with time zone NOT NULL,
	"policy_version" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_funding_observation_period_identity" UNIQUE("id","payment_period_id"),
	CONSTRAINT "recreio_funding_observation_owner" UNIQUE("id","group_id","payer_user_id","provider_mode"),
	CONSTRAINT "recreio_funding_observation_scope" CHECK ("recreio"."funding_observations"."provider"='stripe' and "recreio"."funding_observations"."provider_mode" in ('dev','prod') and length("recreio"."funding_observations"."origin_product_id") between 2 and 80),
	CONSTRAINT "recreio_funding_observation_state" CHECK ("recreio"."funding_observations"."funding_status" in ('verified','revoked','review') and length("recreio"."funding_observations"."policy_version") between 2 and 64 and "recreio"."funding_observations"."evidence_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_funding_observation_dates" CHECK (isfinite("recreio"."funding_observations"."funded_until") and isfinite("recreio"."funding_observations"."first_observed_at"))
);
--> statement-breakpoint
CREATE TABLE "recreio"."funding_source_periods" (
	"observation_id" uuid NOT NULL,
	"provider_charge_id" text NOT NULL,
	"source_payment_period_id" uuid NOT NULL,
	"source_subscription_id" uuid NOT NULL,
	"source_purchase_id" uuid NOT NULL,
	"source_origin_product_id" text NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	CONSTRAINT "recreio_funding_source_period_pk" PRIMARY KEY("observation_id","provider_charge_id","source_payment_period_id"),
	CONSTRAINT "recreio_funding_source_scope" CHECK ("recreio"."funding_source_periods"."provider"='stripe' and "recreio"."funding_source_periods"."provider_mode" in ('dev','prod'))
);
--> statement-breakpoint
CREATE TABLE "recreio"."payment_funding" (
	"payment_period_id" uuid PRIMARY KEY NOT NULL,
	"observation_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_payment_funding_clock" CHECK (isfinite("recreio"."payment_funding"."observed_at"))
);
--> statement-breakpoint
ALTER TABLE "recreio"."funding_captures" ADD CONSTRAINT "funding_captures_observation_id_funding_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "recreio"."funding_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."funding_observations" ADD CONSTRAINT "recreio_funding_observation_period" FOREIGN KEY ("payment_period_id","subscription_id","provider") REFERENCES "billing"."subscription_payment_periods"("id","subscription_id","provider") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."funding_observations" ADD CONSTRAINT "recreio_funding_observation_contract" FOREIGN KEY ("subscription_id","purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") REFERENCES "recreio"."billing_contracts"("subscription_id","purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."funding_source_periods" ADD CONSTRAINT "recreio_funding_source_capture" FOREIGN KEY ("observation_id","provider_charge_id") REFERENCES "recreio"."funding_captures"("observation_id","provider_charge_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."funding_source_periods" ADD CONSTRAINT "recreio_funding_source_owner" FOREIGN KEY ("observation_id","group_id","payer_user_id","provider_mode") REFERENCES "recreio"."funding_observations"("id","group_id","payer_user_id","provider_mode") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."funding_source_periods" ADD CONSTRAINT "recreio_funding_source_period" FOREIGN KEY ("source_payment_period_id","source_subscription_id","provider") REFERENCES "billing"."subscription_payment_periods"("id","subscription_id","provider") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."funding_source_periods" ADD CONSTRAINT "recreio_funding_source_contract" FOREIGN KEY ("source_subscription_id","source_purchase_id","group_id","payer_user_id","provider_mode","source_origin_product_id") REFERENCES "recreio"."billing_contracts"("subscription_id","purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."payment_funding" ADD CONSTRAINT "recreio_payment_funding_observation" FOREIGN KEY ("observation_id","payment_period_id") REFERENCES "recreio"."funding_observations"("id","payment_period_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_funding_observation_content" ON "recreio"."funding_observations" USING btree ("payment_period_id","policy_version","evidence_hash");--> statement-breakpoint
CREATE INDEX "recreio_funding_observation_payer" ON "recreio"."funding_observations" USING btree ("payer_user_id","provider_mode","first_observed_at");