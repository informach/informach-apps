CREATE SCHEMA "family";
--> statement-breakpoint
CREATE TABLE "family"."access_grants" (
	"group_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_profile_id_user_id_action_pk" PRIMARY KEY("profile_id","user_id","action"),
	CONSTRAINT "family_grant_action" CHECK ("family"."access_grants"."action" in ('read', 'write', 'manage', 'use_ai'))
);
--> statement-breakpoint
CREATE TABLE "family"."app_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"app" text NOT NULL,
	"source_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_profile_id_context" UNIQUE("id","group_id"),
	CONSTRAINT "family_profile_app" CHECK (char_length("family"."app_profiles"."app") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "family"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid,
	"person_id" uuid,
	"actor_id" text,
	"event" text NOT NULL,
	"target_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family"."group_people" (
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_people_group_id_person_id_pk" PRIMARY KEY("group_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "family"."groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_group_name" CHECK (char_length("family"."groups"."name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "family"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_by" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_invitation_acceptance" CHECK (("family"."invitations"."accepted_at" is null) = ("family"."invitations"."accepted_by" is null))
);
--> statement-breakpoint
CREATE TABLE "family"."members" (
	"group_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id"),
	CONSTRAINT "family_member_role" CHECK ("family"."members"."role" in ('administrator', 'member'))
);
--> statement-breakpoint
CREATE TABLE "family"."migration_sources" (
	"app" text NOT NULL,
	"source_owner_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_sources_app_source_owner_id_pk" PRIMARY KEY("app","source_owner_id")
);
--> statement-breakpoint
CREATE TABLE "family"."people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"display_name" text,
	"color" text DEFAULT '#48785C' NOT NULL,
	"avatar" text DEFAULT 'person' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_person_kind" CHECK ("family"."people"."kind" in ('adult', 'dependent')),
	CONSTRAINT "family_person_name_source" CHECK (("family"."people"."user_id" is null and "family"."people"."display_name" is not null and char_length("family"."people"."display_name") between 1 and 80) or ("family"."people"."user_id" is not null and "family"."people"."display_name" is null)),
	CONSTRAINT "family_person_color" CHECK ("family"."people"."color" ~ '^#[0-9A-F]{6}$'),
	CONSTRAINT "family_person_avatar" CHECK (char_length("family"."people"."avatar") between 1 and 40),
	CONSTRAINT "family_person_version" CHECK ("family"."people"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "family"."person_managers" (
	"person_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_managers_person_id_user_id_pk" PRIMARY KEY("person_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "family"."access_grants" ADD CONSTRAINT "family_grant_profile_context" FOREIGN KEY ("profile_id","group_id") REFERENCES "family"."app_profiles"("id","group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."access_grants" ADD CONSTRAINT "family_grant_member_context" FOREIGN KEY ("group_id","user_id") REFERENCES "family"."members"("group_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."app_profiles" ADD CONSTRAINT "family_profile_person_context" FOREIGN KEY ("group_id","person_id") REFERENCES "family"."group_people"("group_id","person_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."group_people" ADD CONSTRAINT "group_people_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."group_people" ADD CONSTRAINT "group_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "family"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."invitations" ADD CONSTRAINT "invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."invitations" ADD CONSTRAINT "invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."migration_sources" ADD CONSTRAINT "migration_sources_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."person_managers" ADD CONSTRAINT "person_managers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "family"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family"."person_managers" ADD CONSTRAINT "person_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_grant_user_context" ON "family"."access_grants" USING btree ("user_id","group_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "family_profile_context" ON "family"."app_profiles" USING btree ("group_id","person_id","app");--> statement-breakpoint
CREATE UNIQUE INDEX "family_profile_source" ON "family"."app_profiles" USING btree ("app","source_key") WHERE "family"."app_profiles"."source_key" is not null;--> statement-breakpoint
CREATE INDEX "family_events_context" ON "family"."events" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "family_group_people_person" ON "family"."group_people" USING btree ("person_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_invitation_token" ON "family"."invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "family_invitation_context" ON "family"."invitations" USING btree ("group_id","expires_at");--> statement-breakpoint
CREATE INDEX "family_members_user" ON "family"."members" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_people_account" ON "family"."people" USING btree ("user_id") WHERE "family"."people"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "family_person_managers_user" ON "family"."person_managers" USING btree ("user_id","person_id");