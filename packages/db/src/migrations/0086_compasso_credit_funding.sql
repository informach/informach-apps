ALTER TYPE "billing"."ledger_entry_type" ADD VALUE 'funding_suspension';--> statement-breakpoint
ALTER TYPE "billing"."ledger_entry_type" ADD VALUE 'funding_restoration';--> statement-breakpoint
CREATE TABLE "billing"."credit_funding_states" (
	"grant_entry_id" uuid PRIMARY KEY NOT NULL,
	"blocked" boolean NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "sequence" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "billing"."credit_ledger_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "funding_period_id" uuid;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "source_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "billing"."credit_funding_states" ADD CONSTRAINT "credit_funding_states_grant_entry_id_credit_ledger_id_fk" FOREIGN KEY ("grant_entry_id") REFERENCES "billing"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_funding_period_id_subscription_payment_periods_id_fk" FOREIGN KEY ("funding_period_id") REFERENCES "billing"."subscription_payment_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_source_entry_id_credit_ledger_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "billing"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_funding_period_idx" ON "billing"."credit_ledger" USING btree ("funding_period_id") WHERE "billing"."credit_ledger"."funding_period_id" is not null;--> statement-breakpoint
CREATE INDEX "credit_ledger_source_idx" ON "billing"."credit_ledger" USING btree ("source_entry_id") WHERE "billing"."credit_ledger"."source_entry_id" is not null;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_sequence_safe" CHECK ("billing"."credit_ledger"."sequence" > 0 and "billing"."credit_ledger"."sequence" <= 9007199254740991);--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD CONSTRAINT "credit_ledger_funding_control" CHECK ("billing"."credit_ledger"."entry_type"::text not in ('funding_suspension', 'funding_restoration') or ("billing"."credit_ledger"."source_entry_id" is not null and "billing"."credit_ledger"."source_entry_id" <> "billing"."credit_ledger"."id" and (("billing"."credit_ledger"."entry_type"::text = 'funding_suspension' and "billing"."credit_ledger"."amount" < 0) or ("billing"."credit_ledger"."entry_type"::text = 'funding_restoration' and "billing"."credit_ledger"."amount" > 0))));