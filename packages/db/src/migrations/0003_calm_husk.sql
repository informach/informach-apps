ALTER TABLE "core"."users" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "ban_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "core"."users" USING btree ("role");