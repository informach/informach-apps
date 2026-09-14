ALTER TABLE "agenda"."notice_actions" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD COLUMN "profile_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "notice_actions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "agenda"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "notice_actions_profile_subject_id_profile_subjects_id_fk" FOREIGN KEY ("profile_subject_id") REFERENCES "agenda"."profile_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_notice_actions_subject_idx" ON "agenda"."notice_actions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "agenda_notice_actions_profile_subject_idx" ON "agenda"."notice_actions" USING btree ("profile_subject_id");--> statement-breakpoint
ALTER TABLE "agenda"."notice_actions" ADD CONSTRAINT "agenda_action_subject_exclusive_check" CHECK ("agenda"."notice_actions"."subject_id" IS NULL OR "agenda"."notice_actions"."profile_subject_id" IS NULL);