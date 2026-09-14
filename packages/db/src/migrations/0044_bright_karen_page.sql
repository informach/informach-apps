CREATE TABLE "missao_saber"."content_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"invalidated_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actor_id" text,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."sessions" ADD COLUMN "interrupted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missao_saber"."sessions" ADD COLUMN "interruption_reason" text;--> statement-breakpoint
ALTER TABLE "missao_saber"."content_controls" ADD CONSTRAINT "content_controls_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missao_content_control_lesson" ON "missao_saber"."content_controls" USING btree ("lesson_id","created_at");