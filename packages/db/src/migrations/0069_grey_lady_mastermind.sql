CREATE SCHEMA "edi";
--> statement-breakpoint
CREATE TABLE "billing"."subscription_payment_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider" "billing"."billing_provider" NOT NULL,
	"provider_invoice_id" text NOT NULL,
	"provider_line_id" text NOT NULL,
	"provider_price_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"fully_refunded" boolean DEFAULT false NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payment_period_range_chk" CHECK ("billing"."subscription_payment_periods"."period_end" > "billing"."subscription_payment_periods"."period_start")
);
--> statement-breakpoint
CREATE TABLE "edi"."activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "edi_activations_revision_chk" CHECK ("edi"."activations"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "edi"."device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activation_id" uuid NOT NULL,
	"oauth_grant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "edi"."devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"public_key_spki" text NOT NULL,
	"key_thumbprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edi_devices_name_chk" CHECK (length("edi"."devices"."name") between 1 and 80),
	CONSTRAINT "edi_devices_thumbprint_chk" CHECK ("edi"."devices"."key_thumbprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "edi"."entitlements" (
	"user_id" text PRIMARY KEY NOT NULL,
	"subscription_id" uuid,
	"paid_through" timestamp with time zone,
	"suspended" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edi_entitlements_revision_chk" CHECK ("edi"."entitlements"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "edi"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edi_outbox_kind_chk" CHECK ("edi"."outbox"."kind" in ('reconcile_entitlement', 'revoke_device', 'release_published')),
	CONSTRAINT "edi_outbox_attempts_chk" CHECK ("edi"."outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "edi"."release_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"app_id" text NOT NULL,
	"arch" text DEFAULT 'x64' NOT NULL,
	"platform" text DEFAULT 'win32' NOT NULL,
	"url" text NOT NULL,
	"sha512" text NOT NULL,
	"size" bigint NOT NULL,
	"publisher" text NOT NULL,
	CONSTRAINT "edi_artifacts_target_chk" CHECK ("edi"."release_artifacts"."platform" = 'win32' and "edi"."release_artifacts"."arch" = 'x64'),
	CONSTRAINT "edi_artifacts_size_chk" CHECK ("edi"."release_artifacts"."size" > 0 and "edi"."release_artifacts"."size" <= 9007199254740991),
	CONSTRAINT "edi_artifacts_app_chk" CHECK ("edi"."release_artifacts"."app_id" in ('edi-hub', 'ediaula', 'edicaptura', 'edifoto', 'edipdf', 'edisvg'))
);
--> statement-breakpoint
CREATE TABLE "edi"."release_channels" (
	"channel" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edi_channels_name_chk" CHECK ("edi"."release_channels"."channel" in ('stable', 'beta'))
);
--> statement-breakpoint
CREATE TABLE "edi"."releases" (
	"version" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_sha256" text NOT NULL,
	"source_commit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "edi_releases_channel_chk" CHECK ("edi"."releases"."channel" in ('stable', 'beta'))
);
--> statement-breakpoint
ALTER TABLE "billing"."subscription_payment_periods" ADD CONSTRAINT "subscription_payment_periods_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."activations" ADD CONSTRAINT "activations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "edi"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."device_sessions" ADD CONSTRAINT "device_sessions_activation_id_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "edi"."activations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."entitlements" ADD CONSTRAINT "entitlements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "billing"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."release_artifacts" ADD CONSTRAINT "release_artifacts_version_releases_version_fk" FOREIGN KEY ("version") REFERENCES "edi"."releases"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edi"."release_channels" ADD CONSTRAINT "release_channels_version_releases_version_fk" FOREIGN KEY ("version") REFERENCES "edi"."releases"("version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payment_period_line_uniq" ON "billing"."subscription_payment_periods" USING btree ("provider","provider_invoice_id","provider_line_id");--> statement-breakpoint
CREATE INDEX "subscription_payment_period_subscription_idx" ON "billing"."subscription_payment_periods" USING btree ("subscription_id","period_end");--> statement-breakpoint
CREATE INDEX "subscription_payment_period_invoice_idx" ON "billing"."subscription_payment_periods" USING btree ("provider","provider_invoice_id");--> statement-breakpoint
CREATE INDEX "edi_activations_device_idx" ON "edi"."activations" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edi_activations_live_device_uniq" ON "edi"."activations" USING btree ("device_id") WHERE "edi"."activations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "edi_sessions_activation_idx" ON "edi"."device_sessions" USING btree ("activation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edi_sessions_grant_uniq" ON "edi"."device_sessions" USING btree ("oauth_grant_id");--> statement-breakpoint
CREATE INDEX "edi_sessions_expiry_idx" ON "edi"."device_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "edi_devices_user_idx" ON "edi"."devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edi_devices_key_uniq" ON "edi"."devices" USING btree ("key_thumbprint");--> statement-breakpoint
CREATE INDEX "edi_entitlements_subscription_idx" ON "edi"."entitlements" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "edi_outbox_dedupe_uniq" ON "edi"."outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "edi_outbox_pending_idx" ON "edi"."outbox" USING btree ("available_at") WHERE "edi"."outbox"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "edi_artifacts_target_uniq" ON "edi"."release_artifacts" USING btree ("version","app_id","platform","arch");--> statement-breakpoint
CREATE INDEX "edi_channels_version_idx" ON "edi"."release_channels" USING btree ("version");