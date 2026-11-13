ALTER TABLE "missao_saber"."study_devices" DROP CONSTRAINT "study_devices_user_id_families_user_id_fk";
--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ADD CONSTRAINT "study_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;