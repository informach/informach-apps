CREATE TABLE "agenda"."subject_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"subject_id" uuid,
	"profile_subject_id" uuid,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_subject_kit_target_check" CHECK (("agenda"."subject_kits"."subject_id" IS NOT NULL) <> ("agenda"."subject_kits"."profile_subject_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" DROP CONSTRAINT "agenda_notification_hours_check";--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD COLUMN "suggest_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD COLUMN "weekly_digest_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD COLUMN "weekly_digest_day" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD COLUMN "weekly_digest_hour" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."tasks" ADD COLUMN "study_for_task_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."subject_kits" ADD CONSTRAINT "subject_kits_profile_id_student_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."subject_kits" ADD CONSTRAINT "subject_kits_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "agenda"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."subject_kits" ADD CONSTRAINT "subject_kits_profile_subject_id_profile_subjects_id_fk" FOREIGN KEY ("profile_subject_id") REFERENCES "agenda"."profile_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_subject_kit_turma_idx" ON "agenda"."subject_kits" USING btree ("profile_id","subject_id") WHERE "agenda"."subject_kits"."subject_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_subject_kit_extra_idx" ON "agenda"."subject_kits" USING btree ("profile_id","profile_subject_id") WHERE "agenda"."subject_kits"."profile_subject_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."tasks" ADD CONSTRAINT "tasks_study_for_task_id_tasks_id_fk" FOREIGN KEY ("study_for_task_id") REFERENCES "agenda"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_tasks_study_for_idx" ON "agenda"."tasks" USING btree ("study_for_task_id");--> statement-breakpoint
ALTER TABLE "agenda"."notification_preferences" ADD CONSTRAINT "agenda_notification_hours_check" CHECK ("agenda"."notification_preferences"."digest_hour" BETWEEN 0 AND 23 AND "agenda"."notification_preferences"."quiet_start" BETWEEN 0 AND 23 AND "agenda"."notification_preferences"."quiet_end" BETWEEN 0 AND 23 AND "agenda"."notification_preferences"."weekly_digest_hour" BETWEEN 0 AND 23 AND "agenda"."notification_preferences"."weekly_digest_day" BETWEEN 0 AND 6);