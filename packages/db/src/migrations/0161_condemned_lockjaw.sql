CREATE TABLE "billing"."legacy_billing_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"decision" text NOT NULL,
	"group_id" uuid NOT NULL,
	"coordination_id" uuid NOT NULL,
	"acceptance_id" uuid,
	"policy_version" text NOT NULL,
	"terms_revision" text NOT NULL,
	"terms" jsonb NOT NULL,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_billing_consent_role" CHECK ("billing"."legacy_billing_consents"."role" in ('contributor', 'payer')),
	CONSTRAINT "legacy_billing_consent_decision" CHECK ("billing"."legacy_billing_consents"."decision" in ('accepted', 'declined', 'resumed')),
	CONSTRAINT "legacy_billing_consent_contributor_scope" CHECK (("billing"."legacy_billing_consents"."role" = 'contributor') = ("billing"."legacy_billing_consents"."acceptance_id" is not null)),
	CONSTRAINT "legacy_billing_consent_contributor_decision" CHECK ("billing"."legacy_billing_consents"."role" <> 'contributor' or "billing"."legacy_billing_consents"."decision" = 'accepted'),
	CONSTRAINT "legacy_billing_consent_revision" CHECK ("billing"."legacy_billing_consents"."terms_revision" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "billing"."legacy_billing_coordination_contracts" (
	"coordination_id" uuid NOT NULL,
	"acceptance_id" uuid NOT NULL,
	CONSTRAINT "legacy_billing_coordination_contracts_coordination_id_acceptance_id_pk" PRIMARY KEY("coordination_id","acceptance_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."legacy_billing_coordinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"contributor_user_id" text NOT NULL,
	"policy_version" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"kind" text,
	"subscription_id" uuid,
	"future_intent_id" uuid,
	"provider_price_id" text,
	"amount_cents" integer,
	"interval" text,
	"from_charge_at" timestamp with time zone,
	"contributed_paid_through" timestamp with time zone,
	"defer_until" timestamp with time zone,
	"offer_revision" text,
	"effect_protocol_version" integer DEFAULT 1 NOT NULL,
	"effect_attempted_at" timestamp with time zone,
	"effect_confirmed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_billing_coordination_state" CHECK ("billing"."legacy_billing_coordinations"."state" in ('open', 'payer_accepted', 'applying', 'applied', 'review', 'settled', 'no_effect', 'declined', 'lapsed', 'invalidated', 'canceled')),
	CONSTRAINT "legacy_billing_coordination_kind" CHECK (("billing"."legacy_billing_coordinations"."kind" is null and "billing"."legacy_billing_coordinations"."subscription_id" is null and "billing"."legacy_billing_coordinations"."future_intent_id" is null) or ("billing"."legacy_billing_coordinations"."kind" = 'subscription_trial' and "billing"."legacy_billing_coordinations"."subscription_id" is not null and "billing"."legacy_billing_coordinations"."future_intent_id" is null) or ("billing"."legacy_billing_coordinations"."kind" = 'schedule_start' and "billing"."legacy_billing_coordinations"."future_intent_id" is not null and "billing"."legacy_billing_coordinations"."subscription_id" is null)),
	CONSTRAINT "legacy_billing_coordination_offer" CHECK ("billing"."legacy_billing_coordinations"."state" not in ('payer_accepted', 'applying', 'applied', 'settled') or ("billing"."legacy_billing_coordinations"."kind" is not null and "billing"."legacy_billing_coordinations"."provider_price_id" is not null and "billing"."legacy_billing_coordinations"."amount_cents" is not null and "billing"."legacy_billing_coordinations"."interval" is not null and "billing"."legacy_billing_coordinations"."from_charge_at" is not null and "billing"."legacy_billing_coordinations"."contributed_paid_through" is not null and "billing"."legacy_billing_coordinations"."defer_until" is not null and "billing"."legacy_billing_coordinations"."offer_revision" is not null)),
	CONSTRAINT "legacy_billing_coordination_attempt" CHECK ("billing"."legacy_billing_coordinations"."state" not in ('applying', 'applied', 'settled') or "billing"."legacy_billing_coordinations"."effect_attempted_at" is not null),
	CONSTRAINT "legacy_billing_coordination_confirmation" CHECK ("billing"."legacy_billing_coordinations"."state" not in ('applied', 'settled') or "billing"."legacy_billing_coordinations"."effect_confirmed_at" is not null),
	CONSTRAINT "legacy_billing_coordination_settlement" CHECK ("billing"."legacy_billing_coordinations"."state" <> 'settled' or "billing"."legacy_billing_coordinations"."settled_at" is not null),
	CONSTRAINT "legacy_billing_coordination_dates" CHECK ("billing"."legacy_billing_coordinations"."defer_until" is null or ("billing"."legacy_billing_coordinations"."defer_until" > "billing"."legacy_billing_coordinations"."from_charge_at" and "billing"."legacy_billing_coordinations"."defer_until" >= "billing"."legacy_billing_coordinations"."contributed_paid_through")),
	CONSTRAINT "legacy_billing_coordination_amount" CHECK ("billing"."legacy_billing_coordinations"."amount_cents" is null or "billing"."legacy_billing_coordinations"."amount_cents" > 0),
	CONSTRAINT "legacy_billing_coordination_interval" CHECK ("billing"."legacy_billing_coordinations"."interval" is null or "billing"."legacy_billing_coordinations"."interval" in ('month', 'year')),
	CONSTRAINT "legacy_billing_coordination_protocol" CHECK ("billing"."legacy_billing_coordinations"."effect_protocol_version" in (1)),
	CONSTRAINT "legacy_billing_coordination_revision" CHECK ("billing"."legacy_billing_coordinations"."offer_revision" is null or "billing"."legacy_billing_coordinations"."offer_revision" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_consents" ADD CONSTRAINT "legacy_billing_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_consents" ADD CONSTRAINT "legacy_billing_consents_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_consents" ADD CONSTRAINT "legacy_billing_consents_coordination_id_legacy_billing_coordinations_id_fk" FOREIGN KEY ("coordination_id") REFERENCES "billing"."legacy_billing_coordinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_consents" ADD CONSTRAINT "legacy_billing_consents_acceptance_id_legacy_contract_acceptances_id_fk" FOREIGN KEY ("acceptance_id") REFERENCES "billing"."legacy_contract_acceptances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordination_contracts" ADD CONSTRAINT "legacy_billing_coordination_contracts_coordination_id_legacy_billing_coordinations_id_fk" FOREIGN KEY ("coordination_id") REFERENCES "billing"."legacy_billing_coordinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordination_contracts" ADD CONSTRAINT "legacy_billing_coordination_contracts_acceptance_id_legacy_contract_acceptances_id_fk" FOREIGN KEY ("acceptance_id") REFERENCES "billing"."legacy_contract_acceptances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordinations" ADD CONSTRAINT "legacy_billing_coordinations_account_id_collection_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."collection_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordinations" ADD CONSTRAINT "legacy_billing_coordinations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordinations" ADD CONSTRAINT "legacy_billing_coordinations_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordinations" ADD CONSTRAINT "legacy_billing_coordinations_contributor_user_id_users_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordinations" ADD CONSTRAINT "legacy_billing_coordinations_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_billing_coordinations" ADD CONSTRAINT "legacy_billing_coordinations_future_intent_id_legacy_future_intents_id_fk" FOREIGN KEY ("future_intent_id") REFERENCES "billing"."legacy_future_intents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_billing_consent_request_uniq" ON "billing"."legacy_billing_consents" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_billing_consent_payer_decision_uniq" ON "billing"."legacy_billing_consents" USING btree ("coordination_id","decision","terms_revision") WHERE "billing"."legacy_billing_consents"."role" = 'payer';--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_billing_consent_contributor_uniq" ON "billing"."legacy_billing_consents" USING btree ("coordination_id","acceptance_id") WHERE "billing"."legacy_billing_consents"."role" = 'contributor';--> statement-breakpoint
CREATE INDEX "legacy_billing_consent_user_idx" ON "billing"."legacy_billing_consents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "legacy_billing_coordination_contract_acceptance_idx" ON "billing"."legacy_billing_coordination_contracts" USING btree ("acceptance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_billing_coordination_active_account" ON "billing"."legacy_billing_coordinations" USING btree ("account_id") WHERE "billing"."legacy_billing_coordinations"."state" in ('open', 'payer_accepted', 'applying', 'applied', 'review');--> statement-breakpoint
CREATE INDEX "legacy_billing_coordination_group_idx" ON "billing"."legacy_billing_coordinations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "legacy_billing_coordination_payer_idx" ON "billing"."legacy_billing_coordinations" USING btree ("payer_user_id");--> statement-breakpoint
CREATE INDEX "legacy_billing_coordination_contributor_idx" ON "billing"."legacy_billing_coordinations" USING btree ("contributor_user_id");--> statement-breakpoint
CREATE INDEX "legacy_billing_coordination_recovery_idx" ON "billing"."legacy_billing_coordinations" USING btree ("updated_at") WHERE "billing"."legacy_billing_coordinations"."state" in ('open', 'payer_accepted', 'applying', 'applied', 'review');