CREATE TABLE "core"."web_participations" (
	"user_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"operation_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_participation_revision" CHECK ("core"."web_participations"."revision" >= 0),
	CONSTRAINT "web_participation_state" CHECK ("core"."web_participations"."state" in ('active', 'frozen', 'closed')),
	CONSTRAINT "web_participation_operation" CHECK (("core"."web_participations"."revision" = 0 and "core"."web_participations"."state" = 'active' and "core"."web_participations"."operation_id" is null)
        or ("core"."web_participations"."revision" > 0 and "core"."web_participations"."operation_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "core"."web_participations" ADD CONSTRAINT "web_participations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;