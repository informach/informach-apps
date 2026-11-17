CREATE TABLE "billing"."legacy_contract_acceptance_periods" (
	"acceptance_id" uuid NOT NULL,
	"payment_period_id" uuid NOT NULL,
	CONSTRAINT "legacy_contract_acceptance_periods_acceptance_id_payment_period_id_pk" PRIMARY KEY("acceptance_id","payment_period_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."legacy_contract_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"policy_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."legacy_contract_acceptance_periods" ADD CONSTRAINT "legacy_contract_acceptance_periods_acceptance_id_legacy_contract_acceptances_id_fk" FOREIGN KEY ("acceptance_id") REFERENCES "billing"."legacy_contract_acceptances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_contract_acceptance_periods" ADD CONSTRAINT "legacy_contract_acceptance_periods_payment_period_id_subscription_payment_periods_id_fk" FOREIGN KEY ("payment_period_id") REFERENCES "billing"."subscription_payment_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_contract_acceptances" ADD CONSTRAINT "legacy_contract_acceptances_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_contract_acceptances" ADD CONSTRAINT "legacy_contract_acceptances_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_contract_acceptances" ADD CONSTRAINT "legacy_contract_acceptances_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_contract_acceptance_period_uniq" ON "billing"."legacy_contract_acceptance_periods" USING btree ("payment_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_contract_acceptance_subscription_uniq" ON "billing"."legacy_contract_acceptances" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "legacy_contract_acceptance_group_idx" ON "billing"."legacy_contract_acceptances" USING btree ("group_id");