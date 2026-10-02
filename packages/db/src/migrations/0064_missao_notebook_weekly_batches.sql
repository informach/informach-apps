ALTER TABLE "missao_saber"."families" ADD COLUMN "weekly_report_processed_week" date;--> statement-breakpoint
ALTER TABLE "missao_saber"."notes" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "missao_saber"."notes" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."notes" ADD COLUMN "item_id" text;--> statement-breakpoint
ALTER TABLE "missao_saber"."notes" ADD CONSTRAINT "notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "missao_saber"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missao_notes_page" ON "missao_saber"."notes" USING btree ("profile_id","archived_at","created_at","id");