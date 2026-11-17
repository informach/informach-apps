ALTER TABLE "bora_treinar"."profiles" DROP CONSTRAINT "bora_profiles_name";--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" DROP CONSTRAINT "bora_profiles_color";--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ALTER COLUMN "family_profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" DROP COLUMN "color";