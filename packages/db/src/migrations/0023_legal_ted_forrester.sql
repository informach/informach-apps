CREATE TABLE "agenda"."subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turma_id" uuid NOT NULL,
	"name" text NOT NULL,
	"teacher_name" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda"."subjects" ADD CONSTRAINT "subjects_turma_id_turmas_id_fk" FOREIGN KEY ("turma_id") REFERENCES "agenda"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."subjects" ADD CONSTRAINT "subjects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "core"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_subjects_turma_name_unique_idx" ON "agenda"."subjects" USING btree ("turma_id","name");--> statement-breakpoint
CREATE INDEX "agenda_subjects_turma_idx" ON "agenda"."subjects" USING btree ("turma_id");