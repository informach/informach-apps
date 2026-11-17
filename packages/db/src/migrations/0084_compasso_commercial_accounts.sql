ALTER TYPE "billing"."owner_type" ADD VALUE 'billing_account';--> statement-breakpoint
CREATE TABLE "billing"."collection_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection" text NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."collection_trial_claims" (
	"collection" text NOT NULL,
	"email_hash" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_trial_claims_collection_email_hash_pk" PRIMARY KEY("collection","email_hash")
);
--> statement-breakpoint
CREATE TABLE "billing"."collection_trials" (
	"group_id" uuid NOT NULL,
	"collection" text NOT NULL,
	"started_by" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "collection_trials_group_id_collection_pk" PRIMARY KEY("group_id","collection"),
	CONSTRAINT "collection_trial_window" CHECK ("billing"."collection_trials"."ends_at" > "billing"."collection_trials"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "billing"."customers" DROP CONSTRAINT "customers_subject_kind";--> statement-breakpoint
ALTER TABLE "billing"."collection_accounts" ADD CONSTRAINT "collection_accounts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."collection_accounts" ADD CONSTRAINT "collection_accounts_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."collection_trials" ADD CONSTRAINT "collection_trials_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."collection_trials" ADD CONSTRAINT "collection_trials_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_account_active_group" ON "billing"."collection_accounts" USING btree ("group_id","collection") WHERE "billing"."collection_accounts"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "collection_account_payer" ON "billing"."collection_accounts" USING btree ("payer_user_id","collection");--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_owner_kind" CHECK ("billing"."credit_ledger"."owner_type"::text in ('user', 'organization', 'family'));--> statement-breakpoint
ALTER TABLE "billing"."credit_reservations" ADD CONSTRAINT "credit_reservations_owner_kind" CHECK ("billing"."credit_reservations"."owner_type"::text in ('user', 'organization', 'family'));--> statement-breakpoint
ALTER TABLE "billing"."customers" ADD CONSTRAINT "customers_subject_kind" CHECK ("billing"."customers"."subject_type"::text in ('user', 'organization', 'billing_account'));