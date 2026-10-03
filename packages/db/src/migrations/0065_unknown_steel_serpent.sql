CREATE TABLE "missao_saber"."lab_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"experience_id" text NOT NULL,
	"version" integer NOT NULL,
	"grade" integer NOT NULL,
	"course_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"assessment" jsonb,
	"context" jsonb,
	"legacy" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missao_lab_revision" CHECK ("missao_saber"."lab_executions"."revision" > 0 and "missao_saber"."lab_executions"."version" > 0),
	CONSTRAINT "missao_lab_grade" CHECK ("missao_saber"."lab_executions"."grade" between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."notes" ADD COLUMN "lab_attachment" jsonb;--> statement-breakpoint
ALTER TABLE "missao_saber"."lab_executions" ADD CONSTRAINT "lab_executions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missao_lab_profile_updated" ON "missao_saber"."lab_executions" USING btree ("profile_id","updated_at");