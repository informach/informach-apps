ALTER TABLE "core"."email_deliveries" ADD COLUMN "from_address" text;--> statement-breakpoint
ALTER TABLE "core"."email_deliveries" ADD COLUMN "unsubscribe_url" text;--> statement-breakpoint
ALTER TABLE "core"."email_deliveries" ADD COLUMN "unsubscribe_mailto" text;