DROP INDEX "bora_treinar"."bora_challenges_family_week";--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bora_challenges_group_week" ON "bora_treinar"."challenges" USING btree ("family_group_id","week_start") WHERE "bora_treinar"."challenges"."profile_id" is null;