CREATE TABLE "edi"."billing_reconciliations" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "edi_billing_reconciliations_failures_chk" CHECK ("edi"."billing_reconciliations"."failures" >= 0)
);
--> statement-breakpoint
ALTER TABLE "edi"."billing_reconciliations" ADD CONSTRAINT "billing_reconciliations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edi_billing_reconciliations_due_idx" ON "edi"."billing_reconciliations" USING btree ("next_attempt_at","customer_id");