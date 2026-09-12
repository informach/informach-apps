ALTER TABLE "agenda"."student_profiles" ALTER COLUMN "birth_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD COLUMN "capture_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD COLUMN "billing_run_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD CONSTRAINT "notices_capture_profile_id_student_profiles_id_fk" FOREIGN KEY ("capture_profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;