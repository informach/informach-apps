CREATE TABLE "billing"."legacy_future_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"product_id" text NOT NULL,
	"provider_price_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"interval" text NOT NULL,
	"paid_through" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"terms_revision" text NOT NULL,
	"setup_expires_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'setup_pending' NOT NULL,
	"setup_session_id" text,
	"payment_method_id" text,
	"schedule_id" text,
	"cancel_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_future_intent_state" CHECK ("billing"."legacy_future_intents"."state" in ('setup_pending', 'setup_ready', 'scheduling', 'scheduled', 'review', 'applied', 'canceled', 'failed')),
	CONSTRAINT "legacy_future_intent_interval" CHECK ("billing"."legacy_future_intents"."interval" in ('month', 'year')),
	CONSTRAINT "legacy_future_intent_amount" CHECK ("billing"."legacy_future_intents"."amount_cents" > 0),
	CONSTRAINT "legacy_future_intent_start" CHECK ("billing"."legacy_future_intents"."starts_at" >= "billing"."legacy_future_intents"."paid_through"),
	CONSTRAINT "legacy_future_intent_revision" CHECK ("billing"."legacy_future_intents"."terms_revision" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legacy_future_intent_method" CHECK ("billing"."legacy_future_intents"."state" not in ('setup_ready', 'scheduling', 'scheduled', 'applied') or ("billing"."legacy_future_intents"."setup_session_id" is not null and "billing"."legacy_future_intents"."payment_method_id" is not null)),
	CONSTRAINT "legacy_future_intent_schedule" CHECK ("billing"."legacy_future_intents"."state" not in ('scheduled', 'applied') or "billing"."legacy_future_intents"."schedule_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "billing"."legacy_future_intents" ADD CONSTRAINT "legacy_future_intents_account_id_collection_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."collection_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."legacy_future_intents" ADD CONSTRAINT "legacy_future_intents_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_future_intent_request_uniq" ON "billing"."legacy_future_intents" USING btree ("payer_user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_future_intent_setup_uniq" ON "billing"."legacy_future_intents" USING btree ("setup_session_id") WHERE "billing"."legacy_future_intents"."setup_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_future_intent_schedule_uniq" ON "billing"."legacy_future_intents" USING btree ("schedule_id") WHERE "billing"."legacy_future_intents"."schedule_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_future_intent_active_account" ON "billing"."legacy_future_intents" USING btree ("account_id") WHERE "billing"."legacy_future_intents"."state" in ('setup_pending', 'setup_ready', 'scheduling', 'scheduled', 'review');