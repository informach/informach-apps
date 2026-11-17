ALTER TABLE "bora_treinar"."challenges" DROP CONSTRAINT "challenges_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" DROP CONSTRAINT "profiles_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" DROP CONSTRAINT "sessions_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ADD CONSTRAINT "challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;