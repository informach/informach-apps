ALTER TABLE "missao_saber"."profiles" DROP CONSTRAINT "profiles_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ALTER COLUMN "nickname" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ALTER COLUMN "avatar" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ALTER COLUMN "avatar" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;