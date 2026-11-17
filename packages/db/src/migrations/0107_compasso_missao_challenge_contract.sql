ALTER TABLE "missao_saber"."family_challenges" DROP CONSTRAINT "family_challenges_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "missao_saber"."family_challenges" DROP CONSTRAINT "family_challenges_user_id_week_start_pk";--> statement-breakpoint
ALTER TABLE "missao_saber"."family_challenges" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."family_challenges" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."family_challenges" ADD CONSTRAINT "family_challenges_family_group_id_week_start_pk" PRIMARY KEY("family_group_id","week_start");--> statement-breakpoint
ALTER TABLE "missao_saber"."family_challenges" ADD CONSTRAINT "family_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;