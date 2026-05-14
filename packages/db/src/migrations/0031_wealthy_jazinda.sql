CREATE TABLE "agenda"."profile_subject_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"profile_subject_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."profile_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color_index" smallint DEFAULT 1 NOT NULL,
	"class_days" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_profile_subjects_class_days_valid" CHECK ("agenda"."profile_subjects"."class_days" <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]),
	CONSTRAINT "agenda_profile_subjects_paused_consistency" CHECK (("agenda"."profile_subjects"."status" = 'paused' AND "agenda"."profile_subjects"."paused_at" IS NOT NULL)
          OR ("agenda"."profile_subjects"."status" = 'active' AND "agenda"."profile_subjects"."paused_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "agenda"."profile_subject_activities" ADD CONSTRAINT "profile_subject_activities_profile_id_student_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profile_subject_activities" ADD CONSTRAINT "profile_subject_activities_profile_subject_id_profile_subjects_id_fk" FOREIGN KEY ("profile_subject_id") REFERENCES "agenda"."profile_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profile_subject_activities" ADD CONSTRAINT "profile_subject_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profile_subjects" ADD CONSTRAINT "profile_subjects_profile_id_student_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_profile_subject_activities_profile_due_idx" ON "agenda"."profile_subject_activities" USING btree ("profile_id","due_at");--> statement-breakpoint
CREATE INDEX "agenda_profile_subject_activities_subject_idx" ON "agenda"."profile_subject_activities" USING btree ("profile_subject_id");--> statement-breakpoint
CREATE INDEX "agenda_profile_subject_activities_status_due_idx" ON "agenda"."profile_subject_activities" USING btree ("status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_profile_subjects_profile_name_unique_idx" ON "agenda"."profile_subjects" USING btree ("profile_id","name");--> statement-breakpoint
CREATE INDEX "agenda_profile_subjects_profile_status_idx" ON "agenda"."profile_subjects" USING btree ("profile_id","status");