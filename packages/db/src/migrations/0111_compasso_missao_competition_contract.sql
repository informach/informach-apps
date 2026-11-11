ALTER TABLE "missao_saber"."competitions" DROP CONSTRAINT "competitions_user_id_families_user_id_fk";
--> statement-breakpoint
DROP INDEX "missao_saber"."missao_competition_request";--> statement-breakpoint
DROP INDEX "missao_saber"."missao_competitions_owner";--> statement-breakpoint
ALTER TABLE "missao_saber"."competitions" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."competitions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."competitions" ADD CONSTRAINT "competitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "missao_competition_group_request" ON "missao_saber"."competitions" USING btree ("family_group_id","request_key");--> statement-breakpoint
CREATE INDEX "missao_competitions_family" ON "missao_saber"."competitions" USING btree ("family_group_id","created_at");