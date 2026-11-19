CREATE TABLE "recreio"."billing_reconciliations" (
	"payer_user_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"provider_mode" text NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_confirmed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"review_required" boolean DEFAULT true NOT NULL,
	"review_reason" text DEFAULT 'awaiting_provider',
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_reconciliations_payer_user_id_provider_mode_pk" PRIMARY KEY("payer_user_id","provider_mode"),
	CONSTRAINT "recreio_billing_reconciliation_group_mode" UNIQUE("group_id","provider_mode"),
	CONSTRAINT "recreio_billing_reconciliation_mode" CHECK ("recreio"."billing_reconciliations"."provider_mode" in ('dev','prod')),
	CONSTRAINT "recreio_billing_reconciliation_attempt" CHECK ("recreio"."billing_reconciliations"."attempt_count" >= 0 and
      (("recreio"."billing_reconciliations"."last_attempt_at" is null and "recreio"."billing_reconciliations"."attempt_count"=0) or ("recreio"."billing_reconciliations"."last_attempt_at" is not null and "recreio"."billing_reconciliations"."attempt_count">0))),
	CONSTRAINT "recreio_billing_reconciliation_confirmation" CHECK ("recreio"."billing_reconciliations"."last_confirmed_at" is null or "recreio"."billing_reconciliations"."last_attempt_at" is not null),
	CONSTRAINT "recreio_billing_reconciliation_review" CHECK (
      ("recreio"."billing_reconciliations"."review_required" and "recreio"."billing_reconciliations"."review_reason" is not null and "recreio"."billing_reconciliations"."review_reason" in ('awaiting_provider','customer_unconfirmed','provider_unavailable','evidence_mismatch','adverse_event','foreign_contract')) or
      (not "recreio"."billing_reconciliations"."review_required" and "recreio"."billing_reconciliations"."review_reason" is null and "recreio"."billing_reconciliations"."last_confirmed_at" is not null)),
	CONSTRAINT "recreio_billing_reconciliation_lease" CHECK (("recreio"."billing_reconciliations"."lease_token" is null) = ("recreio"."billing_reconciliations"."lease_until" is null)),
	CONSTRAINT "recreio_billing_reconciliation_order" CHECK ("recreio"."billing_reconciliations"."updated_at" >= "recreio"."billing_reconciliations"."created_at" and
      ("recreio"."billing_reconciliations"."last_attempt_at" is null or "recreio"."billing_reconciliations"."last_attempt_at" >= "recreio"."billing_reconciliations"."created_at") and
      ("recreio"."billing_reconciliations"."last_confirmed_at" is null or "recreio"."billing_reconciliations"."last_confirmed_at" >= "recreio"."billing_reconciliations"."created_at") and
      ("recreio"."billing_reconciliations"."lease_until" is null or "recreio"."billing_reconciliations"."lease_until" > "recreio"."billing_reconciliations"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "recreio"."purchase_authorizations" ADD COLUMN "provider_mode" text DEFAULT 'dev' NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."billing_reconciliations" ADD CONSTRAINT "recreio_billing_reconciliation_payer" FOREIGN KEY ("group_id","payer_user_id") REFERENCES "recreio"."groups"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_billing_reconciliation_due" ON "recreio"."billing_reconciliations" USING btree ("provider_mode","next_attempt_at","payer_user_id");--> statement-breakpoint
ALTER TABLE "recreio"."purchase_authorizations" ADD CONSTRAINT "recreio_purchase_authorization_mode" CHECK ("recreio"."purchase_authorizations"."provider_mode" in ('dev','prod'));