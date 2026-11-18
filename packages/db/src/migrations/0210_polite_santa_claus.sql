CREATE TABLE "recreio"."billing_contracts" (
	"subscription_id" uuid PRIMARY KEY NOT NULL,
	"purchase_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	"origin_product_id" text NOT NULL,
	"origin_price_id" text NOT NULL,
	"current_product_id" text NOT NULL,
	"current_price_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_plan_change_id" uuid,
	"current_plan_applied_at" timestamp with time zone,
	CONSTRAINT "recreio_billing_contract_mode" CHECK ("recreio"."billing_contracts"."provider_mode" in ('dev','prod')),
	CONSTRAINT "recreio_billing_contract_offer" CHECK (length("recreio"."billing_contracts"."origin_price_id") between 8 and 256 and length("recreio"."billing_contracts"."current_price_id") between 8 and 256 and length("recreio"."billing_contracts"."current_product_id") between 2 and 80),
	CONSTRAINT "recreio_billing_contract_revision" CHECK (
    ("recreio"."billing_contracts"."revision"=1 and "recreio"."billing_contracts"."current_plan_change_id" is null and "recreio"."billing_contracts"."current_plan_applied_at" is null and "recreio"."billing_contracts"."current_product_id"="recreio"."billing_contracts"."origin_product_id" and "recreio"."billing_contracts"."current_price_id"="recreio"."billing_contracts"."origin_price_id") or
    ("recreio"."billing_contracts"."revision">1 and "recreio"."billing_contracts"."current_plan_change_id" is not null and "recreio"."billing_contracts"."current_plan_applied_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "recreio"."plan_change_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_change_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"profile_reference" uuid NOT NULL,
	"profile_id" uuid,
	"policy_version" integer NOT NULL,
	"coverage_enabled" boolean NOT NULL,
	CONSTRAINT "recreio_plan_selection_profile" UNIQUE("plan_change_id","profile_reference"),
	CONSTRAINT "recreio_plan_selection_identity" CHECK ("recreio"."plan_change_profiles"."policy_version">=1 and ("recreio"."plan_change_profiles"."profile_id" is null or "recreio"."plan_change_profiles"."profile_id"="recreio"."plan_change_profiles"."profile_reference"))
);
--> statement-breakpoint
CREATE TABLE "recreio"."plan_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	"origin_product_id" text NOT NULL,
	"expected_contract_revision" integer NOT NULL,
	"from_product_id" text NOT NULL,
	"from_price_id" text NOT NULL,
	"to_product_id" text NOT NULL,
	"to_price_id" text NOT NULL,
	"kind" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"proration_at" timestamp with time zone,
	"quoted_amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"policy_version" text NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"quote_expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"request_started_at" timestamp with time zone,
	"provider_schedule_id" text,
	"provider_invoice_id" text,
	"status" text NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"applied_revision" integer,
	"resolved_at" timestamp with time zone,
	"review_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recreio_plan_change_group_identity" UNIQUE("id","group_id"),
	CONSTRAINT "recreio_plan_change_applied_identity" UNIQUE("id","subscription_id","purchase_id","group_id","payer_user_id","provider_mode","to_product_id","to_price_id","applied_at","applied_revision"),
	CONSTRAINT "recreio_plan_change_mode" CHECK ("recreio"."plan_changes"."provider_mode" in ('dev','prod')),
	CONSTRAINT "recreio_plan_change_offer" CHECK ("recreio"."plan_changes"."from_product_id" <> "recreio"."plan_changes"."to_product_id" and "recreio"."plan_changes"."from_price_id" <> "recreio"."plan_changes"."to_price_id" and
    length("recreio"."plan_changes"."origin_product_id") between 2 and 80 and length("recreio"."plan_changes"."from_product_id") between 2 and 80 and length("recreio"."plan_changes"."to_product_id") between 2 and 80 and
    length("recreio"."plan_changes"."from_price_id") between 8 and 256 and length("recreio"."plan_changes"."to_price_id") between 8 and 256 and "recreio"."plan_changes"."expected_contract_revision" >= 1 and
    "recreio"."plan_changes"."quoted_amount_cents" >= 0 and "recreio"."plan_changes"."currency"='BRL' and length("recreio"."plan_changes"."policy_version") between 2 and 64),
	CONSTRAINT "recreio_plan_change_effect" CHECK ("recreio"."plan_changes"."period_end" > "recreio"."plan_changes"."period_start" and
    (("recreio"."plan_changes"."kind"='upgrade' and "recreio"."plan_changes"."proration_at" is not null and "recreio"."plan_changes"."effective_at"="recreio"."plan_changes"."proration_at" and "recreio"."plan_changes"."effective_at">="recreio"."plan_changes"."period_start" and "recreio"."plan_changes"."effective_at"<"recreio"."plan_changes"."period_end") or
     ("recreio"."plan_changes"."kind"='downgrade' and "recreio"."plan_changes"."proration_at" is null and "recreio"."plan_changes"."effective_at"="recreio"."plan_changes"."period_end" and "recreio"."plan_changes"."quoted_amount_cents"=0))),
	CONSTRAINT "recreio_plan_change_quote" CHECK ("recreio"."plan_changes"."quote_expires_at">"recreio"."plan_changes"."quoted_at" and "recreio"."plan_changes"."quote_expires_at"<="recreio"."plan_changes"."quoted_at"+interval '15 minutes' and
    ("recreio"."plan_changes"."accepted_at" is null or ("recreio"."plan_changes"."accepted_at">="recreio"."plan_changes"."quoted_at" and "recreio"."plan_changes"."accepted_at"<"recreio"."plan_changes"."quote_expires_at")) and
    ("recreio"."plan_changes"."request_started_at" is null or ("recreio"."plan_changes"."accepted_at" is not null and "recreio"."plan_changes"."request_started_at">="recreio"."plan_changes"."accepted_at" and "recreio"."plan_changes"."request_started_at"<"recreio"."plan_changes"."quote_expires_at"))),
	CONSTRAINT "recreio_plan_change_status" CHECK ("recreio"."plan_changes"."status" in ('quoted','accepted','sent','scheduled','applied','canceled','failed') and
    (("recreio"."plan_changes"."status"='quoted' and "recreio"."plan_changes"."accepted_at" is null and "recreio"."plan_changes"."request_started_at" is null) or
     ("recreio"."plan_changes"."status"='accepted' and "recreio"."plan_changes"."accepted_at" is not null and "recreio"."plan_changes"."request_started_at" is null) or
     ("recreio"."plan_changes"."status" in ('sent','scheduled','applied') and "recreio"."plan_changes"."accepted_at" is not null and "recreio"."plan_changes"."request_started_at" is not null) or
     "recreio"."plan_changes"."status" in ('canceled','failed')) and
    (("recreio"."plan_changes"."resolved_at" is not null) = ("recreio"."plan_changes"."status" in ('applied','canceled','failed'))) and
    (("recreio"."plan_changes"."applied_at" is not null) = ("recreio"."plan_changes"."status"='applied')) and
    (("recreio"."plan_changes"."applied_revision" is not null) = ("recreio"."plan_changes"."status"='applied')) and
    ("recreio"."plan_changes"."applied_revision" is null or "recreio"."plan_changes"."applied_revision"="recreio"."plan_changes"."expected_contract_revision"+1) and
    ("recreio"."plan_changes"."resolved_at" is null or "recreio"."plan_changes"."resolved_at">=coalesce("recreio"."plan_changes"."request_started_at","recreio"."plan_changes"."accepted_at","recreio"."plan_changes"."quoted_at")) and
    ("recreio"."plan_changes"."applied_at" is null or ("recreio"."plan_changes"."applied_at">="recreio"."plan_changes"."request_started_at" and "recreio"."plan_changes"."applied_at">="recreio"."plan_changes"."effective_at" and "recreio"."plan_changes"."applied_at"<="recreio"."plan_changes"."resolved_at"))),
	CONSTRAINT "recreio_plan_change_remote" CHECK (("recreio"."plan_changes"."provider_schedule_id" is null or ("recreio"."plan_changes"."kind"='downgrade' and "recreio"."plan_changes"."request_started_at" is not null and length("recreio"."plan_changes"."provider_schedule_id") between 8 and 256)) and
    ("recreio"."plan_changes"."provider_invoice_id" is null or ("recreio"."plan_changes"."kind"='upgrade' and "recreio"."plan_changes"."request_started_at" is not null and length("recreio"."plan_changes"."provider_invoice_id") between 8 and 256)) and
    ("recreio"."plan_changes"."status"<>'scheduled' or "recreio"."plan_changes"."provider_schedule_id" is not null) and
    ("recreio"."plan_changes"."status"<>'applied' or ("recreio"."plan_changes"."kind"='downgrade' and "recreio"."plan_changes"."provider_schedule_id" is not null) or ("recreio"."plan_changes"."kind"='upgrade' and "recreio"."plan_changes"."provider_invoice_id" is not null)) and
    ("recreio"."plan_changes"."cancel_requested_at" is null or ("recreio"."plan_changes"."cancel_requested_at">="recreio"."plan_changes"."quoted_at" and ("recreio"."plan_changes"."resolved_at" is null or "recreio"."plan_changes"."cancel_requested_at"<="recreio"."plan_changes"."resolved_at"))) and
    (not "recreio"."plan_changes"."review_required" or ("recreio"."plan_changes"."request_started_at" is not null and "recreio"."plan_changes"."resolved_at" is null)))
);
--> statement-breakpoint
ALTER TABLE "recreio"."billing_contracts" ADD CONSTRAINT "billing_contracts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."billing_contracts" ADD CONSTRAINT "recreio_billing_contract_purchase" FOREIGN KEY ("purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") REFERENCES "recreio"."purchase_authorizations"("id","group_id","payer_user_id","provider_mode","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."billing_contracts" ADD CONSTRAINT "recreio_billing_contract_current_change" FOREIGN KEY ("current_plan_change_id","subscription_id","purchase_id","group_id","payer_user_id","provider_mode","current_product_id","current_price_id","current_plan_applied_at","revision") REFERENCES "recreio"."plan_changes"("id","subscription_id","purchase_id","group_id","payer_user_id","provider_mode","to_product_id","to_price_id","applied_at","applied_revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."plan_change_profiles" ADD CONSTRAINT "plan_change_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."plan_change_profiles" ADD CONSTRAINT "recreio_plan_selection_change" FOREIGN KEY ("plan_change_id","group_id") REFERENCES "recreio"."plan_changes"("id","group_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."plan_changes" ADD CONSTRAINT "plan_changes_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."plan_changes" ADD CONSTRAINT "recreio_plan_change_purchase" FOREIGN KEY ("purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") REFERENCES "recreio"."purchase_authorizations"("id","group_id","payer_user_id","provider_mode","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_billing_contract_payer" ON "recreio"."billing_contracts" USING btree ("payer_user_id","provider_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_plan_change_active" ON "recreio"."plan_changes" USING btree ("subscription_id") WHERE "recreio"."plan_changes"."resolved_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_plan_change_schedule" ON "recreio"."plan_changes" USING btree ("provider_mode","provider_schedule_id") WHERE "recreio"."plan_changes"."provider_schedule_id" is not null;--> statement-breakpoint
CREATE INDEX "recreio_plan_change_payer" ON "recreio"."plan_changes" USING btree ("payer_user_id","provider_mode","quoted_at");