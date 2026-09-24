CREATE TABLE "agenda"."family_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"first_steps_dismissed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda"."family_settings" ADD CONSTRAINT "family_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;