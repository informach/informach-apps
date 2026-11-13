CREATE TABLE "account"."web_closure_consents" (
	"closure_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"digest" text NOT NULL,
	"plans" jsonb NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_closure_consents_closure_id_revision_pk" PRIMARY KEY("closure_id","revision"),
	CONSTRAINT "account_web_closure_consent_revision" CHECK ("account"."web_closure_consents"."revision" > 0),
	CONSTRAINT "account_web_closure_consent_digest" CHECK ("account"."web_closure_consents"."digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "account_web_closure_consent_plans" CHECK (jsonb_typeof("account"."web_closure_consents"."plans") = 'array' and jsonb_array_length("account"."web_closure_consents"."plans") between 3 and 66 and octet_length("account"."web_closure_consents"."plans"::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "account"."web_closures" DROP CONSTRAINT "account_web_closure_state";--> statement-breakpoint
ALTER TABLE "account"."web_closures" DROP CONSTRAINT "account_web_closure_consent";--> statement-breakpoint
ALTER TABLE "billing"."collection_closure_receipts" DROP CONSTRAINT "collection_closure_receipts_operation_id_customer_id_pk";--> statement-breakpoint
ALTER TABLE "billing"."collection_closure_receipts" ADD CONSTRAINT "collection_closure_receipt_scope_pk" PRIMARY KEY("operation_id","customer_id","scope_fingerprint");--> statement-breakpoint
ALTER TABLE "account"."web_closures" ADD COLUMN "plan_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "account"."web_closure_consents" ADD CONSTRAINT "web_closure_consents_closure_id_web_closures_id_fk" FOREIGN KEY ("closure_id") REFERENCES "account"."web_closures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."web_closures" ADD CONSTRAINT "account_web_closure_plan_revision" CHECK ("account"."web_closures"."plan_revision" > 0);--> statement-breakpoint
ALTER TABLE "account"."web_closures" ADD CONSTRAINT "account_web_closure_state" CHECK ("account"."web_closures"."state" in ('preparing','ready','executing','paused','repreparing','review_required','finalizing','resuming','completed','cancelled'));--> statement-breakpoint
ALTER TABLE "account"."web_closures" ADD CONSTRAINT "account_web_closure_consent" CHECK ((
    ("account"."web_closures"."state" in ('preparing','ready','resuming','cancelled') and "account"."web_closures"."consent_digest" is null and "account"."web_closures"."confirmed_at" is null)
    or ("account"."web_closures"."state" in ('executing','paused','repreparing','review_required','finalizing','completed') and "account"."web_closures"."consent_digest" is not null and "account"."web_closures"."consent_digest" ~ '^[a-f0-9]{64}$' and "account"."web_closures"."confirmed_at" is not null)
  ));