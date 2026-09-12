CREATE TABLE "agenda"."notice_applications" (
	"notice_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda"."notices" ADD COLUMN "source_profile_ids" jsonb;--> statement-breakpoint
ALTER TABLE "agenda"."notice_applications" ADD CONSTRAINT "notice_applications_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "agenda"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."notice_applications" ADD CONSTRAINT "notice_applications_profile_id_student_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "agenda"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notice_application_profile_idx" ON "agenda"."notice_applications" USING btree ("notice_id","profile_id");