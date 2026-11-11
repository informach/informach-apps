CREATE TABLE "family"."person_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"expected_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"outcome" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_transfer_distinct_adults" CHECK ("family"."person_transfers"."source_user_id" <> "family"."person_transfers"."target_user_id"),
	CONSTRAINT "person_transfer_version" CHECK ("family"."person_transfers"."expected_version" > 0),
	CONSTRAINT "person_transfer_validity" CHECK ("family"."person_transfers"."expires_at" > "family"."person_transfers"."created_at"),
	CONSTRAINT "person_transfer_resolution" CHECK (("family"."person_transfers"."resolved_at" is null and "family"."person_transfers"."outcome" is null) or ("family"."person_transfers"."resolved_at" is not null and "family"."person_transfers"."outcome" is not null and "family"."person_transfers"."outcome" in ('accepted', 'revoked')))
);
--> statement-breakpoint
ALTER TABLE "family"."person_transfers" ADD CONSTRAINT "person_transfers_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."person_transfers" ADD CONSTRAINT "person_transfers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "family"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."person_transfers" ADD CONSTRAINT "person_transfers_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."person_transfers" ADD CONSTRAINT "person_transfers_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "person_transfer_pending" ON "family"."person_transfers" USING btree ("person_id") WHERE "family"."person_transfers"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "person_transfer_recipient" ON "family"."person_transfers" USING btree ("target_user_id","group_id");