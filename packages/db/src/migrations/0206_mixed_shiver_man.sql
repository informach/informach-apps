CREATE TABLE "recreio"."purchase_authorizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payer_user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"tier" text NOT NULL,
	"interval" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"policy_version" text NOT NULL,
	"adult_declaration_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"request_started_at" timestamp with time zone,
	"provider_session_id" text,
	"review_required" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	CONSTRAINT "recreio_purchase_authorization_offer" CHECK ("recreio"."purchase_authorizations"."tier" in ('individual','family') and "recreio"."purchase_authorizations"."interval" in ('month','year') and "recreio"."purchase_authorizations"."currency"='BRL' and "recreio"."purchase_authorizations"."amount_cents">0 and length("recreio"."purchase_authorizations"."product_id") between 2 and 80),
	CONSTRAINT "recreio_purchase_authorization_versions" CHECK (length("recreio"."purchase_authorizations"."policy_version") between 2 and 64 and length("recreio"."purchase_authorizations"."adult_declaration_version") between 2 and 64),
	CONSTRAINT "recreio_purchase_authorization_resolution" CHECK (
    ("recreio"."purchase_authorizations"."resolved_at" is null and "recreio"."purchase_authorizations"."resolution" is null) or
    ("recreio"."purchase_authorizations"."resolved_at" is not null and "recreio"."purchase_authorizations"."resolution" is not null and "recreio"."purchase_authorizations"."resolution" in ('not_started','checkout_completed','expired_unpaid'))),
	CONSTRAINT "recreio_purchase_authorization_order" CHECK (
    ("recreio"."purchase_authorizations"."request_started_at" is null or "recreio"."purchase_authorizations"."request_started_at">="recreio"."purchase_authorizations"."accepted_at") and
    ("recreio"."purchase_authorizations"."resolved_at" is null or "recreio"."purchase_authorizations"."resolved_at">=coalesce("recreio"."purchase_authorizations"."request_started_at","recreio"."purchase_authorizations"."accepted_at"))),
	CONSTRAINT "recreio_purchase_authorization_attempt" CHECK (
    ("recreio"."purchase_authorizations"."resolution" is distinct from 'not_started' or ("recreio"."purchase_authorizations"."request_started_at" is null and "recreio"."purchase_authorizations"."provider_session_id" is null)) and
    ("recreio"."purchase_authorizations"."resolution" is null or "recreio"."purchase_authorizations"."resolution"='not_started' or ("recreio"."purchase_authorizations"."request_started_at" is not null and "recreio"."purchase_authorizations"."provider_session_id" is not null)) and
    ("recreio"."purchase_authorizations"."provider_session_id" is null or ("recreio"."purchase_authorizations"."request_started_at" is not null and length("recreio"."purchase_authorizations"."provider_session_id") between 8 and 256)) and
    (not "recreio"."purchase_authorizations"."review_required" or ("recreio"."purchase_authorizations"."request_started_at" is not null and "recreio"."purchase_authorizations"."resolved_at" is null)))
);
--> statement-breakpoint
ALTER TABLE "recreio"."purchase_authorizations" ADD CONSTRAINT "recreio_purchase_authorization_payer" FOREIGN KEY ("group_id","payer_user_id") REFERENCES "recreio"."groups"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_purchase_authorization_active" ON "recreio"."purchase_authorizations" USING btree ("payer_user_id") WHERE "recreio"."purchase_authorizations"."resolved_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_purchase_authorization_session" ON "recreio"."purchase_authorizations" USING btree ("provider_session_id") WHERE "recreio"."purchase_authorizations"."provider_session_id" is not null;