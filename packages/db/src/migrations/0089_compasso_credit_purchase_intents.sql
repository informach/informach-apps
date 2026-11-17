CREATE TABLE "billing"."credit_purchase_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"product_id" text NOT NULL,
	"price_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"credits" integer NOT NULL,
	"request" jsonb NOT NULL,
	"request_started" boolean DEFAULT false NOT NULL,
	"provider_session_id" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"payment_id" uuid,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"revoked_credits" integer DEFAULT 0 NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"observed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_purchase_amounts" CHECK ("billing"."credit_purchase_intents"."amount_cents" > 0 and "billing"."credit_purchase_intents"."credits" > 0 and "billing"."credit_purchase_intents"."refunded_amount_cents" between 0 and "billing"."credit_purchase_intents"."amount_cents" and "billing"."credit_purchase_intents"."revoked_credits" between 0 and "billing"."credit_purchase_intents"."credits"),
	CONSTRAINT "credit_purchase_outcome" CHECK ("billing"."credit_purchase_intents"."outcome" in ('pending', 'paid', 'expired', 'failed') and (("billing"."credit_purchase_intents"."outcome" = 'pending') = ("billing"."credit_purchase_intents"."resolved_at" is null)) and (("billing"."credit_purchase_intents"."outcome" = 'paid') = ("billing"."credit_purchase_intents"."payment_id" is not null)))
);
--> statement-breakpoint
ALTER TABLE "billing"."credit_purchase_intents" ADD CONSTRAINT "credit_purchase_intents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_purchase_intents" ADD CONSTRAINT "credit_purchase_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_purchase_intents" ADD CONSTRAINT "credit_purchase_intents_payment_id_one_time_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "billing"."one_time_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchase_request_uniq" ON "billing"."credit_purchase_intents" USING btree ("customer_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchase_pending_uniq" ON "billing"."credit_purchase_intents" USING btree ("customer_id") WHERE "billing"."credit_purchase_intents"."outcome" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchase_session_uniq" ON "billing"."credit_purchase_intents" USING btree ("provider_session_id") WHERE "billing"."credit_purchase_intents"."provider_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchase_payment_uniq" ON "billing"."credit_purchase_intents" USING btree ("payment_id") WHERE "billing"."credit_purchase_intents"."payment_id" is not null;--> statement-breakpoint
CREATE INDEX "credit_purchase_customer_created_idx" ON "billing"."credit_purchase_intents" USING btree ("customer_id","created_at");