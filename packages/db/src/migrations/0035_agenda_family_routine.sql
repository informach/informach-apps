CREATE TABLE "agenda"."activity_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid,
	"notice_action_id" uuid,
	"actor_id" text,
	"version" integer NOT NULL,
	"previous" jsonb NOT NULL,
	"current" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_revision_one_target" CHECK (("agenda"."activity_revisions"."activity_id" IS NOT NULL) <> ("agenda"."activity_revisions"."notice_action_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "agenda"."calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."family_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"profile_ids" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_family_distinct_adults" CHECK ("agenda"."family_members"."owner_user_id" <> "agenda"."family_members"."user_id")
);
--> statement-breakpoint
CREATE TABLE "agenda"."family_profile_access" (
	"member_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."notice_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid,
	"profile_id" uuid NOT NULL,
	"created_by_user_id" text,
	"assigned_to_user_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" date,
	"time" text,
	"location" text,
	"date_origin" text DEFAULT 'unspecified' NOT NULL,
	"source_excerpt" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"series_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_action_date_origin_check" CHECK (("agenda"."notice_actions"."due_at" IS NULL AND "agenda"."notice_actions"."date_origin" = 'unspecified') OR ("agenda"."notice_actions"."due_at" IS NOT NULL AND "agenda"."notice_actions"."date_origin" IN ('school','relative','family'))),
	CONSTRAINT "agenda_action_time_check" CHECK ("agenda"."notice_actions"."time" IS NULL OR ("agenda"."notice_actions"."due_at" IS NOT NULL AND "agenda"."notice_actions"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "agenda_action_status_check" CHECK ("agenda"."notice_actions"."status" IN ('pending','done','canceled'))
);
--> statement-breakpoint
CREATE TABLE "agenda"."notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_by_user_id" text,
	"source" text NOT NULL,
	"source_url" text,
	"published_at" date,
	"text" text DEFAULT '' NOT NULL,
	"content_hash" text NOT NULL,
	"attachment_name" text,
	"attachment_type" text,
	"attachment_data" text,
	"attachment_expires_at" timestamp with time zone,
	"status" text DEFAULT 'processing' NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"parsed_result" jsonb,
	"failure_code" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_notice_status_check" CHECK ("agenda"."notices"."status" IN ('processing','ready','failed','confirmed'))
);
--> statement-breakpoint
CREATE TABLE "agenda"."notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"message_key" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"digest_hour" integer DEFAULT 19 NOT NULL,
	"quiet_start" integer DEFAULT 21 NOT NULL,
	"quiet_end" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_notification_hours_check" CHECK ("agenda"."notification_preferences"."digest_hour" BETWEEN 0 AND 23 AND "agenda"."notification_preferences"."quiet_start" BETWEEN 0 AND 23 AND "agenda"."notification_preferences"."quiet_end" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE "agenda"."product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"source" text,
	"count" integer,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda"."activities" DROP CONSTRAINT "activities_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."profile_subject_activities" DROP CONSTRAINT "profile_subject_activities_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."subjects" DROP CONSTRAINT "subjects_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agenda"."turmas" DROP CONSTRAINT "turmas_created_by_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "agenda"."agenda_turmas_natural_key_idx";--> statement-breakpoint
ALTER TABLE "agenda"."activities" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."profile_subject_activities" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."subjects" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."turmas" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agenda"."turmas" ADD COLUMN "shift" text DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."activity_revisions" ADD CONSTRAINT "activity_revisions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "agenda"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_revisions" ADD CONSTRAINT "activity_revisions_notice_action_id_notice_actions_id_fk" FOREIGN KEY ("notice_action_id") REFERENCES "agenda"."notice_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_revisions" ADD CONSTRAINT "activity_revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_invitations" ADD CONSTRAINT "family_invitations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_members" ADD CONSTRAINT "family_members_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_profile_access" ADD CONSTRAINT "family_profile_access_member_id_family_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "agenda"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."family_profile_access" ADD CONSTRAINT "family_profile_access_profile_id_student_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "notice_actions_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "agenda"."notices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "notice_actions_profile_id_student_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "notice_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "notice_actions_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD CONSTRAINT "notices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD CONSTRAINT "notices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."product_events" ADD CONSTRAINT "product_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_activity_revision_version_idx" ON "agenda"."activity_revisions" USING btree ("activity_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notice_revision_version_idx" ON "agenda"."activity_revisions" USING btree ("notice_action_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_feed_token_idx" ON "agenda"."calendar_feeds" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agenda_feed_user_idx" ON "agenda"."calendar_feeds" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_family_invite_token_idx" ON "agenda"."family_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agenda_family_invite_owner_idx" ON "agenda"."family_invitations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_family_one_guest_idx" ON "agenda"."family_members" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_family_guest_owner_idx" ON "agenda"."family_members" USING btree ("user_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_family_profile_access_idx" ON "agenda"."family_profile_access" USING btree ("member_id","profile_id");--> statement-breakpoint
CREATE INDEX "agenda_family_access_profile_idx" ON "agenda"."family_profile_access" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "agenda_notice_actions_profile_due_idx" ON "agenda"."notice_actions" USING btree ("profile_id","due_at");--> statement-breakpoint
CREATE INDEX "agenda_notice_actions_reminder_idx" ON "agenda"."notice_actions" USING btree ("reminder_at","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notice_actions_notice_profile_idx" ON "agenda"."notice_actions" USING btree ("notice_id","profile_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notice_actions_series_due_idx" ON "agenda"."notice_actions" USING btree ("series_id","profile_id","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notices_owner_hash_idx" ON "agenda"."notices" USING btree ("owner_user_id","content_hash");--> statement-breakpoint
CREATE INDEX "agenda_notices_owner_created_idx" ON "agenda"."notices" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "agenda_notices_expiry_idx" ON "agenda"."notices" USING btree ("attachment_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_delivery_idempotency_idx" ON "agenda"."notification_deliveries" USING btree ("user_id","channel","message_key");--> statement-breakpoint
CREATE INDEX "agenda_product_event_time_idx" ON "agenda"."product_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_push_endpoint_idx" ON "agenda"."push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "agenda_push_user_idx" ON "agenda"."push_subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD CONSTRAINT "activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profile_subject_activities" ADD CONSTRAINT "profile_subject_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."subjects" ADD CONSTRAINT "subjects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."turmas" ADD CONSTRAINT "turmas_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_turmas_owner_key_idx" ON "agenda"."turmas" USING btree ("school_inep_code","grade","year","class_letter","shift","created_by_user_id");