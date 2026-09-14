CREATE TABLE "missao_saber"."report_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_id" text,
	"status" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "missao_saber"."missao_reports_open";--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "missao_saber"."families" AS family
SET "created_at" = COALESCE(
	(SELECT min(profile."created_at") FROM "missao_saber"."profiles" AS profile WHERE profile."user_id" = family."user_id"),
	now()
);--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "request_key" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
UPDATE "missao_saber"."reports" SET "status" = 'resolved' WHERE "resolved_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "missao_saber"."report_updates" ADD CONSTRAINT "report_updates_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "missao_saber"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."report_updates" ADD CONSTRAINT "report_updates_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missao_report_updates_report" ON "missao_saber"."report_updates" USING btree ("report_id","created_at");--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD CONSTRAINT "reports_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD CONSTRAINT "reports_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "missao_saber"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "missao_reports_recurrence" ON "missao_saber"."reports" USING btree ("lesson_id","item_id","category","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missao_report_request" ON "missao_saber"."reports" USING btree ("user_id","request_key") WHERE "missao_saber"."reports"."request_key" is not null;--> statement-breakpoint
CREATE INDEX "missao_reports_open" ON "missao_saber"."reports" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD CONSTRAINT "missao_report_status" CHECK ("missao_saber"."reports"."status" in ('open', 'investigating', 'resolved') and (("missao_saber"."reports"."status" = 'resolved') = ("missao_saber"."reports"."resolved_at" is not null)));--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD CONSTRAINT "missao_report_category" CHECK ("missao_saber"."reports"."category" is null or "missao_saber"."reports"."category" in ('not_understood', 'possible_error', 'figure_issue', 'app_difficulty'));
