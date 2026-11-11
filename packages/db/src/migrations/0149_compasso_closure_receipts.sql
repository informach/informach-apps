CREATE TABLE "billing"."collection_closure_receipts" (
	"operation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"frozen_revision" integer NOT NULL,
	"scope_fingerprint" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_closure_receipts_operation_id_customer_id_pk" PRIMARY KEY("operation_id","customer_id"),
	CONSTRAINT "collection_closure_revision" CHECK ("billing"."collection_closure_receipts"."frozen_revision" > 0),
	CONSTRAINT "collection_closure_fingerprint" CHECK ("billing"."collection_closure_receipts"."scope_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "billing"."collection_closure_receipts" ADD CONSTRAINT "collection_closure_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."collection_closure_receipts" ADD CONSTRAINT "collection_closure_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;