ALTER TABLE "missao_saber"."study_device_profiles" ALTER COLUMN "delegation_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ALTER COLUMN "read_grant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_device_profiles" ALTER COLUMN "write_grant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."study_devices" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "missao_study_device_family" ON "missao_saber"."study_devices" USING btree ("family_group_id","user_id");