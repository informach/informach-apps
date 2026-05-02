CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE TYPE "billing"."billing_provider" AS ENUM('stripe', 'asaas');--> statement-breakpoint
CREATE TYPE "billing"."ledger_entry_type" AS ENUM('purchase', 'bonus_grant', 'promo_grant', 'consumption', 'refund', 'expiration', 'adjustment');--> statement-breakpoint
CREATE TYPE "billing"."owner_type" AS ENUM('user', 'organization');--> statement-breakpoint
CREATE TYPE "billing"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "billing"."reservation_status" AS ENUM('active', 'committed', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "billing"."subscription_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused');--> statement-breakpoint
CREATE TABLE "billing"."credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "billing"."owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"entry_type" "billing"."ledger_entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"reservation_id" uuid,
	"payment_id" uuid,
	"stripe_event_id" text,
	"run_id" text,
	"product_sku" text,
	"actor_user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_amount_nonzero_chk" CHECK ("billing"."credit_ledger"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"prompt_cost_per_1k" integer DEFAULT 0 NOT NULL,
	"completion_cost_per_1k" integer DEFAULT 0 NOT NULL,
	"flat_cost" integer DEFAULT 0 NOT NULL,
	"default_estimate_credits" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "billing"."owner_type" NOT NULL,
	"owner_id" text NOT NULL,
	"estimated_amount" integer NOT NULL,
	"status" "billing"."reservation_status" DEFAULT 'active' NOT NULL,
	"app" text NOT NULL,
	"feature" text NOT NULL,
	"model" text,
	"pricing_id" uuid,
	"run_id" text,
	"request_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "credit_reservations_amount_positive_chk" CHECK ("billing"."credit_reservations"."estimated_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"provider_customer_id" text NOT NULL,
	"subject_type" "billing"."owner_type" NOT NULL,
	"subject_id" text NOT NULL,
	"email" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."one_time_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"provider_payment_id" text NOT NULL,
	"product_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"status" "billing"."payment_status" NOT NULL,
	"credit_amount" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"product_id" text NOT NULL,
	"provider_price_id" text NOT NULL,
	"status" "billing"."subscription_status" NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_reservation_id_credit_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "billing"."credit_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_payment_id_one_time_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "billing"."one_time_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_reservations" ADD CONSTRAINT "credit_reservations_pricing_id_credit_pricing_id_fk" FOREIGN KEY ("pricing_id") REFERENCES "billing"."credit_pricing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."one_time_payments" ADD CONSTRAINT "one_time_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_owner_created_idx" ON "billing"."credit_ledger" USING btree ("owner_type","owner_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_owner_expires_idx" ON "billing"."credit_ledger" USING btree ("owner_type","owner_id","expires_at") WHERE "billing"."credit_ledger"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_stripe_event_uniq" ON "billing"."credit_ledger" USING btree ("stripe_event_id") WHERE "billing"."credit_ledger"."stripe_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_ledger_reservation_idx" ON "billing"."credit_ledger" USING btree ("reservation_id") WHERE "billing"."credit_ledger"."reservation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_pricing_feature_model_effective_idx" ON "billing"."credit_pricing" USING btree ("feature","model","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_pricing_active_uniq" ON "billing"."credit_pricing" USING btree ("feature","model") WHERE "billing"."credit_pricing"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "credit_reservations_owner_active_idx" ON "billing"."credit_reservations" USING btree ("owner_type","owner_id") WHERE "billing"."credit_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "credit_reservations_active_expires_idx" ON "billing"."credit_reservations" USING btree ("expires_at") WHERE "billing"."credit_reservations"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "customers_provider_subject_uniq" ON "billing"."customers" USING btree ("provider","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_provider_provider_id_uniq" ON "billing"."customers" USING btree ("provider","provider_customer_id");--> statement-breakpoint
CREATE INDEX "customers_subject_idx" ON "billing"."customers" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_time_payments_provider_id_uniq" ON "billing"."one_time_payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "one_time_payments_customer_status_idx" ON "billing"."one_time_payments" USING btree ("customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_id_uniq" ON "billing"."subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_status_idx" ON "billing"."subscriptions" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "billing"."subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_uniq" ON "billing"."webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_idx" ON "billing"."webhook_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "webhook_events_event_type_idx" ON "billing"."webhook_events" USING btree ("event_type");