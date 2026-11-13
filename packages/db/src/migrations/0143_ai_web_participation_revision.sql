ALTER TABLE "ai"."operation_receipts" ADD COLUMN "web_participation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cozya"."ai_operations" ADD COLUMN "web_participation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai"."operation_receipts" ADD CONSTRAINT "ai_operation_receipt_web_revision" CHECK ("ai"."operation_receipts"."web_participation_revision" >= 0);--> statement-breakpoint
ALTER TABLE "cozya"."ai_operations" ADD CONSTRAINT "cozya_ai_operations_web_revision" CHECK ("cozya"."ai_operations"."web_participation_revision" >= 0);