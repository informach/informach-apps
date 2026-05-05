DROP INDEX "billing"."credit_ledger_stripe_event_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_stripe_event_uniq" ON "billing"."credit_ledger" USING btree ("stripe_event_id");