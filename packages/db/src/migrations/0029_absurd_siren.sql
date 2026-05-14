CREATE TABLE "agenda"."subject_alternating_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"paired_subject_id" uuid NOT NULL,
	"anchor_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agenda_subject_alt_slots_day_valid" CHECK ("agenda"."subject_alternating_slots"."day_of_week" IN ('mon','tue','wed','thu','fri')),
	CONSTRAINT "agenda_subject_alt_slots_diff_subject" CHECK ("agenda"."subject_alternating_slots"."subject_id" <> "agenda"."subject_alternating_slots"."paired_subject_id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."subject_alternating_slots" ADD CONSTRAINT "subject_alternating_slots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "agenda"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."subject_alternating_slots" ADD CONSTRAINT "subject_alternating_slots_paired_subject_id_subjects_id_fk" FOREIGN KEY ("paired_subject_id") REFERENCES "agenda"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_subject_alt_slots_subject_day_idx" ON "agenda"."subject_alternating_slots" USING btree ("subject_id","day_of_week");--> statement-breakpoint
CREATE INDEX "agenda_subject_alt_slots_paired_idx" ON "agenda"."subject_alternating_slots" USING btree ("paired_subject_id");