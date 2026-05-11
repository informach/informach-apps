CREATE TABLE "agenda"."activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turma_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"type" text NOT NULL,
	"visibility" text DEFAULT 'individual' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."activity_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"accepted" boolean NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda"."activity_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD CONSTRAINT "activities_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "agenda"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD CONSTRAINT "activities_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "agenda"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activities" ADD CONSTRAINT "activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_acceptances" ADD CONSTRAINT "activity_acceptances_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "agenda"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_acceptances" ADD CONSTRAINT "activity_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_statuses" ADD CONSTRAINT "activity_statuses_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "agenda"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."activity_statuses" ADD CONSTRAINT "activity_statuses_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_activities_turma_due_idx" ON "agenda"."activities" USING btree ("turma_id","due_at");--> statement-breakpoint
CREATE INDEX "agenda_activities_creator_due_idx" ON "agenda"."activities" USING btree ("created_by_user_id","due_at");--> statement-breakpoint
CREATE INDEX "agenda_activities_subject_idx" ON "agenda"."activities" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_activity_acceptances_unique_idx" ON "agenda"."activity_acceptances" USING btree ("activity_id","user_id");--> statement-breakpoint
CREATE INDEX "agenda_activity_acceptances_user_idx" ON "agenda"."activity_acceptances" USING btree ("user_id","accepted");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_activity_statuses_unique_idx" ON "agenda"."activity_statuses" USING btree ("activity_id","student_profile_id");--> statement-breakpoint
CREATE INDEX "agenda_activity_statuses_profile_idx" ON "agenda"."activity_statuses" USING btree ("student_profile_id","status");