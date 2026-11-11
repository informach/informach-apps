CREATE TABLE "ai"."operation_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"scope_key" text NOT NULL,
	"feature" text NOT NULL,
	"request_hash" text NOT NULL,
	"tariff" text NOT NULL,
	"max_credits" integer NOT NULL,
	"run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"phase" text NOT NULL,
	"result" jsonb,
	"actual_credits" integer,
	"lease_until" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_operation_receipt_phase" CHECK ("ai"."operation_receipts"."phase" IN ('processing', 'output', 'complete', 'failed')),
	CONSTRAINT "ai_operation_receipt_cost" CHECK ("ai"."operation_receipts"."max_credits" > 0 AND ("ai"."operation_receipts"."actual_credits" IS NULL OR ("ai"."operation_receipts"."actual_credits" > 0 AND "ai"."operation_receipts"."actual_credits" <= "ai"."operation_receipts"."max_credits"))),
	CONSTRAINT "ai_operation_receipt_output" CHECK (("ai"."operation_receipts"."result" IS NULL) = ("ai"."operation_receipts"."actual_credits" IS NULL) AND ("ai"."operation_receipts"."phase" NOT IN ('output', 'complete') OR "ai"."operation_receipts"."result" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai"."operation_receipts" ADD CONSTRAINT "operation_receipts_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai"."operation_receipts" ADD CONSTRAINT "operation_receipts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "family"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_operation_receipt_request" ON "ai"."operation_receipts" USING btree ("app","actor_user_id","group_id","scope_key","feature","request_hash");--> statement-breakpoint
CREATE INDEX "ai_operation_receipt_retention" ON "ai"."operation_receipts" USING btree ("app","expires_at");