CREATE TABLE "recreio"."renewal_cancellations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"payer_user_id" text NOT NULL,
	"provider_mode" text NOT NULL,
	"origin_product_id" text NOT NULL,
	"expected_contract_revision" integer NOT NULL,
	"expected_product_id" text NOT NULL,
	"expected_price_id" text NOT NULL,
	"expected_period_end" timestamp with time zone NOT NULL,
	"provider_customer_id" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"initiator" text NOT NULL,
	"closure_operation_id" uuid,
	"closure_operation_kind" text DEFAULT 'encerrar_conta' NOT NULL,
	"policy_version" text NOT NULL,
	"source" text NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"request_started_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"review_code" text,
	"provider_result" text,
	"provider_stop_at" timestamp with time zone,
	"observation_sha256" text,
	"observed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_renewal_cancellation_subscription" UNIQUE("subscription_id"),
	CONSTRAINT "recreio_renewal_cancellation_origin" CHECK ((
      "recreio"."renewal_cancellations"."closure_operation_kind"='encerrar_conta' and (
        ("recreio"."renewal_cancellations"."initiator"='native' and "recreio"."renewal_cancellations"."closure_operation_id" is null) or
        ("recreio"."renewal_cancellations"."initiator"='account_closure' and "recreio"."renewal_cancellations"."closure_operation_id" is not null)
      )) is true),
	CONSTRAINT "recreio_renewal_cancellation_terms" CHECK (
      "recreio"."renewal_cancellations"."policy_version"='renovacao-2026-11-19-v1' and "recreio"."renewal_cancellations"."source" ~ '^[a-f0-9]{40}$' and
      "recreio"."renewal_cancellations"."provider_mode" in ('dev','prod') and "recreio"."renewal_cancellations"."expected_contract_revision">=1 and
      length("recreio"."renewal_cancellations"."expected_product_id") between 2 and 80 and length("recreio"."renewal_cancellations"."expected_price_id") between 8 and 256 and
      "recreio"."renewal_cancellations"."provider_customer_id" ~ '^cus_[A-Za-z0-9_]{3,124}$' and "recreio"."renewal_cancellations"."provider_subscription_id" ~ '^sub_[A-Za-z0-9_]{3,124}$'),
	CONSTRAINT "recreio_renewal_cancellation_state" CHECK (
      "recreio"."renewal_cancellations"."state" in ('accepted','attempted','confirmed','review') and
      ("recreio"."renewal_cancellations"."state"<>'accepted' or "recreio"."renewal_cancellations"."request_started_at" is null) and
      ("recreio"."renewal_cancellations"."state" not in ('attempted','confirmed') or "recreio"."renewal_cancellations"."request_started_at" is not null)),
	CONSTRAINT "recreio_renewal_cancellation_review" CHECK (((
      "recreio"."renewal_cancellations"."state"='review' and "recreio"."renewal_cancellations"."review_code" in ('provider_unavailable','scope_changed','foreign_contract','namespace_mismatch','invalid_evidence')
    ) or ("recreio"."renewal_cancellations"."state"<>'review' and "recreio"."renewal_cancellations"."review_code" is null)) is true),
	CONSTRAINT "recreio_renewal_cancellation_confirmation" CHECK (((
      "recreio"."renewal_cancellations"."state"='confirmed' and "recreio"."renewal_cancellations"."request_started_at" is not null and "recreio"."renewal_cancellations"."observed_at">="recreio"."renewal_cancellations"."request_started_at" and
      "recreio"."renewal_cancellations"."observation_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."renewal_cancellations"."confirmed_at">="recreio"."renewal_cancellations"."observed_at" and "recreio"."renewal_cancellations"."updated_at">="recreio"."renewal_cancellations"."confirmed_at" and
      (("recreio"."renewal_cancellations"."provider_result"='scheduled' and "recreio"."renewal_cancellations"."provider_stop_at">"recreio"."renewal_cancellations"."observed_at") or
       ("recreio"."renewal_cancellations"."provider_result"='terminal' and "recreio"."renewal_cancellations"."provider_stop_at" is null))
    ) or (
      "recreio"."renewal_cancellations"."state"<>'confirmed' and "recreio"."renewal_cancellations"."provider_result" is null and "recreio"."renewal_cancellations"."provider_stop_at" is null and
      "recreio"."renewal_cancellations"."observation_sha256" is null and "recreio"."renewal_cancellations"."observed_at" is null and "recreio"."renewal_cancellations"."confirmed_at" is null
    )) is true),
	CONSTRAINT "recreio_renewal_cancellation_lease" CHECK (((
      "recreio"."renewal_cancellations"."lease_token" is null and "recreio"."renewal_cancellations"."lease_until" is null
    ) or (
      "recreio"."renewal_cancellations"."lease_token" is not null and "recreio"."renewal_cancellations"."lease_until">"recreio"."renewal_cancellations"."updated_at" and "recreio"."renewal_cancellations"."state"<>'confirmed'
    )) is true),
	CONSTRAINT "recreio_renewal_cancellation_times" CHECK (
      "recreio"."renewal_cancellations"."accepted_at">="recreio"."renewal_cancellations"."authenticated_at" and "recreio"."renewal_cancellations"."accepted_at"<"recreio"."renewal_cancellations"."authenticated_at"+interval '10 minutes' and
      "recreio"."renewal_cancellations"."created_at">="recreio"."renewal_cancellations"."accepted_at" and "recreio"."renewal_cancellations"."updated_at">="recreio"."renewal_cancellations"."created_at" and "recreio"."renewal_cancellations"."next_attempt_at">="recreio"."renewal_cancellations"."created_at" and
      (("recreio"."renewal_cancellations"."request_started_at" is null and "recreio"."renewal_cancellations"."attempts"=0) or
       ("recreio"."renewal_cancellations"."request_started_at" is not null and "recreio"."renewal_cancellations"."request_started_at">="recreio"."renewal_cancellations"."accepted_at" and "recreio"."renewal_cancellations"."request_started_at"<="recreio"."renewal_cancellations"."updated_at" and "recreio"."renewal_cancellations"."attempts">=1))),
	CONSTRAINT "recreio_renewal_cancellation_finite" CHECK (isfinite("recreio"."renewal_cancellations"."authenticated_at") and isfinite("recreio"."renewal_cancellations"."accepted_at") and isfinite("recreio"."renewal_cancellations"."expected_period_end") and
        isfinite("recreio"."renewal_cancellations"."created_at") and isfinite("recreio"."renewal_cancellations"."updated_at") and isfinite("recreio"."renewal_cancellations"."next_attempt_at") and
        ("recreio"."renewal_cancellations"."request_started_at" is null or isfinite("recreio"."renewal_cancellations"."request_started_at")) and
        ("recreio"."renewal_cancellations"."lease_until" is null or isfinite("recreio"."renewal_cancellations"."lease_until")) and
        ("recreio"."renewal_cancellations"."provider_stop_at" is null or isfinite("recreio"."renewal_cancellations"."provider_stop_at")) and
        ("recreio"."renewal_cancellations"."observed_at" is null or isfinite("recreio"."renewal_cancellations"."observed_at")) and
        ("recreio"."renewal_cancellations"."confirmed_at" is null or isfinite("recreio"."renewal_cancellations"."confirmed_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."renewal_cancellations" ADD CONSTRAINT "recreio_renewal_cancellation_contract" FOREIGN KEY ("subscription_id","purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") REFERENCES "recreio"."billing_contracts"("subscription_id","purchase_id","group_id","payer_user_id","provider_mode","origin_product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."renewal_cancellations" ADD CONSTRAINT "recreio_renewal_cancellation_closure" FOREIGN KEY ("closure_operation_id","payer_user_id","closure_operation_kind") REFERENCES "recreio"."rights_operations"("id","requester_user_id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_renewal_cancellation_due" ON "recreio"."renewal_cancellations" USING btree ("state","next_attempt_at","id") WHERE "recreio"."renewal_cancellations"."state"<>'confirmed';--> statement-breakpoint
CREATE INDEX "recreio_renewal_cancellation_payer" ON "recreio"."renewal_cancellations" USING btree ("payer_user_id","provider_mode","accepted_at","id");