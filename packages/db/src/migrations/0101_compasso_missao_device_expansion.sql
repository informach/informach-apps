ALTER TABLE "missao_saber"."study_device_profiles" ADD COLUMN "delegation_key" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ADD COLUMN "read_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ADD COLUMN "write_grant_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ADD CONSTRAINT "study_device_profiles_read_grant_id_access_grants_id_fk" FOREIGN KEY ("read_grant_id") REFERENCES "family"."access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ADD CONSTRAINT "study_device_profiles_write_grant_id_access_grants_id_fk" FOREIGN KEY ("write_grant_id") REFERENCES "family"."access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ADD CONSTRAINT "study_devices_family_group_id_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "family"."groups"("id") ON DELETE restrict ON UPDATE no action;