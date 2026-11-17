CREATE TABLE "billing"."collection_plan_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"from_price_id" text NOT NULL,
	"to_price_id" text NOT NULL,
	"to_product_id" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"provider_schedule_id" text,
	"request_started_at" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_plan_changes_status_chk" CHECK ("billing"."collection_plan_changes"."status" IN ('preparing', 'scheduled', 'applied', 'canceled', 'failed')),
	CONSTRAINT "collection_plan_changes_prices_chk" CHECK ("billing"."collection_plan_changes"."from_price_id" <> "billing"."collection_plan_changes"."to_price_id"),
	CONSTRAINT "collection_plan_changes_resolution_chk" CHECK (("billing"."collection_plan_changes"."resolved_at" IS NOT NULL) = ("billing"."collection_plan_changes"."status" IN ('applied', 'canceled', 'failed'))),
	CONSTRAINT "collection_plan_changes_provider_chk" CHECK ("billing"."collection_plan_changes"."provider_schedule_id" IS NULL OR "billing"."collection_plan_changes"."request_started_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "billing"."collection_plan_changes" ADD CONSTRAINT "collection_plan_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."collection_plan_changes" ADD CONSTRAINT "collection_plan_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_plan_changes_request_uniq" ON "billing"."collection_plan_changes" USING btree ("subscription_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_plan_changes_pending_uniq" ON "billing"."collection_plan_changes" USING btree ("subscription_id") WHERE "billing"."collection_plan_changes"."status" IN ('preparing', 'scheduled');--> statement-breakpoint
CREATE UNIQUE INDEX "collection_plan_changes_schedule_uniq" ON "billing"."collection_plan_changes" USING btree ("provider_schedule_id") WHERE "billing"."collection_plan_changes"."provider_schedule_id" IS NOT NULL;