ALTER TABLE "core"."sessions" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD COLUMN "active_team_id" text;--> statement-breakpoint
CREATE INDEX "sessions_active_organization_id_idx" ON "core"."sessions" USING btree ("active_organization_id");