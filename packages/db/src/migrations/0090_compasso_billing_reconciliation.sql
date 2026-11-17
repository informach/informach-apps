CREATE TABLE "billing"."collection_billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."collection_billing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_version" integer DEFAULT 1 NOT NULL,
	"processed_version" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_billing_jobs_kind_chk" CHECK ("billing"."collection_billing_jobs"."kind" IN ('subscription', 'credit_purchase')),
	CONSTRAINT "collection_billing_jobs_version_chk" CHECK ("billing"."collection_billing_jobs"."requested_version" >= "billing"."collection_billing_jobs"."processed_version" AND "billing"."collection_billing_jobs"."processed_version" >= 0 AND "billing"."collection_billing_jobs"."attempts" >= 0),
	CONSTRAINT "collection_billing_jobs_lease_chk" CHECK (("billing"."collection_billing_jobs"."lease_token" IS NULL) = ("billing"."collection_billing_jobs"."lease_until" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD COLUMN "provider_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."collection_billing_events" ADD CONSTRAINT "collection_billing_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."collection_billing_jobs" ADD CONSTRAINT "collection_billing_jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_billing_events_provider_id_uniq" ON "billing"."collection_billing_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "collection_billing_events_customer_idx" ON "billing"."collection_billing_events" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_billing_jobs_subject_uniq" ON "billing"."collection_billing_jobs" USING btree ("kind","subject_id");--> statement-breakpoint
CREATE INDEX "collection_billing_jobs_due_idx" ON "billing"."collection_billing_jobs" USING btree ("next_attempt_at","id");--> statement-breakpoint
CREATE INDEX "collection_billing_jobs_customer_idx" ON "billing"."collection_billing_jobs" USING btree ("customer_id");