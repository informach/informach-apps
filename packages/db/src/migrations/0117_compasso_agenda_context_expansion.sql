CREATE TABLE "agenda"."calendar_feed_profiles" (
	"feed_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"read_grant_id" uuid NOT NULL,
	"activation_generation" uuid NOT NULL,
	CONSTRAINT "calendar_feed_profiles_feed_id_profile_id_pk" PRIMARY KEY("feed_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."notices" DROP CONSTRAINT "notices_owner_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."notices" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."activity_acceptances" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."turma_members" ADD COLUMN "enrolled_by_user_id" text;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feeds" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feeds" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agenda"."family_settings" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."idempotent_writes" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feed_profiles" ADD CONSTRAINT "calendar_feed_profiles_feed_id_calendar_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "agenda"."calendar_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feed_profiles" ADD CONSTRAINT "agenda_feed_profile_context_fk" FOREIGN KEY ("profile_id","group_id") REFERENCES "family"."app_profiles"("id","group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD CONSTRAINT "activities_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_acceptances" ADD CONSTRAINT "activity_acceptances_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."turma_members" ADD CONSTRAINT "turma_members_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_settings" ADD CONSTRAINT "family_settings_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."idempotent_writes" ADD CONSTRAINT "idempotent_writes_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD CONSTRAINT "notices_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD CONSTRAINT "notices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_settings" ADD CONSTRAINT "family_settings_family_group_id_unique" UNIQUE("family_group_id");