DROP INDEX "agenda"."agenda_activity_acceptances_unique_idx";--> statement-breakpoint
ALTER TABLE "agenda"."activity_acceptances" ALTER COLUMN "family_group_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_activity_acceptances_unique_idx" ON "agenda"."activity_acceptances" USING btree ("activity_id","user_id","family_group_id");