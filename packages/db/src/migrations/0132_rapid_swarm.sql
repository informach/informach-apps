CREATE TABLE "billing"."credit_wallet_migration_entries" (
	"source_entry_id" uuid PRIMARY KEY NOT NULL,
	"migration_id" uuid NOT NULL,
	"destination_entry_id" uuid,
	"kind" text NOT NULL,
	"source_amount" integer NOT NULL,
	"destination_amount" integer NOT NULL,
	CONSTRAINT "credit_wallet_migration_entries_kind" CHECK ("billing"."credit_wallet_migration_entries"."kind" in ('opening', 'forwarded')),
	CONSTRAINT "credit_wallet_migration_entries_destination_amount" CHECK (("billing"."credit_wallet_migration_entries"."destination_entry_id" is null and "billing"."credit_wallet_migration_entries"."destination_amount" = 0) or ("billing"."credit_wallet_migration_entries"."destination_entry_id" is not null and "billing"."credit_wallet_migration_entries"."destination_amount" <> 0))
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_wallet_migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_app" text NOT NULL,
	"source_user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"policy_id" text NOT NULL,
	"multiplier" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_wallet_migrations_app" CHECK ("billing"."credit_wallet_migrations"."source_app" in ('cozya', 'agenda-da-turma')),
	CONSTRAINT "credit_wallet_migrations_multiplier" CHECK ("billing"."credit_wallet_migrations"."multiplier" > 0)
);
--> statement-breakpoint
ALTER TABLE "billing"."credit_wallet_migration_entries" ADD CONSTRAINT "credit_wallet_migration_entries_source_entry_id_credit_ledger_id_fk" FOREIGN KEY ("source_entry_id") REFERENCES "billing"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_wallet_migration_entries" ADD CONSTRAINT "credit_wallet_migration_entries_migration_id_credit_wallet_migrations_id_fk" FOREIGN KEY ("migration_id") REFERENCES "billing"."credit_wallet_migrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_wallet_migration_entries" ADD CONSTRAINT "credit_wallet_migration_entries_destination_entry_id_credit_ledger_id_fk" FOREIGN KEY ("destination_entry_id") REFERENCES "billing"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_wallet_migrations" ADD CONSTRAINT "credit_wallet_migrations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_wallet_migration_entries_destination" ON "billing"."credit_wallet_migration_entries" USING btree ("destination_entry_id");--> statement-breakpoint
CREATE INDEX "credit_wallet_migration_entries_receipt" ON "billing"."credit_wallet_migration_entries" USING btree ("migration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_wallet_migrations_source" ON "billing"."credit_wallet_migrations" USING btree ("source_app","source_user_id");--> statement-breakpoint
CREATE INDEX "credit_wallet_migrations_group" ON "billing"."credit_wallet_migrations" USING btree ("group_id");