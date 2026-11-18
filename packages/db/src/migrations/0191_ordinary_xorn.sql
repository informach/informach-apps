ALTER TABLE "recreio"."spaces" ADD COLUMN "management_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD CONSTRAINT "recreio_spaces_management_revision" CHECK ("recreio"."spaces"."management_revision" >= 1);