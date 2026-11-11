ALTER TABLE "missao_saber"."profiles" ALTER COLUMN "family_profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" DROP COLUMN "nickname";--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" DROP COLUMN "avatar";