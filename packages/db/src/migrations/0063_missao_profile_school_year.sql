ALTER TABLE "missao_saber"."profiles" DROP CONSTRAINT "missao_profile_grade";--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD COLUMN "grade_year" integer DEFAULT (extract(year from now()))::int NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD COLUMN "birth_month" date;--> statement-breakpoint
CREATE INDEX "missao_reports_owner" ON "missao_saber"."reports" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD CONSTRAINT "missao_profile_grade_year" CHECK ("missao_saber"."profiles"."grade_year" between 2000 and 2100);--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD CONSTRAINT "missao_profile_grade" CHECK ("missao_saber"."profiles"."grade" between 1 and 12);