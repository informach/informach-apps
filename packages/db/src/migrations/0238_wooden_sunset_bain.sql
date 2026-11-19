CREATE TABLE "recreio"."account_closure_finances" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"requester_user_id" text NOT NULL,
	"operation_kind" text DEFAULT 'encerrar_conta' NOT NULL,
	"provider_mode" text NOT NULL,
	"customer_id" uuid,
	"provider_customer_id" text,
	"policy_version" text NOT NULL,
	"state" text NOT NULL,
	"request_started_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"review_code" text,
	"result" text,
	"observation_sha256" text,
	"observed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_account_closure_finance_scope" CHECK (("recreio"."account_closure_finances"."operation_kind"='encerrar_conta' and "recreio"."account_closure_finances"."provider_mode" in ('dev','prod') and "recreio"."account_closure_finances"."policy_version"='encerramento-financeiro-2026-11-19-v1' and (("recreio"."account_closure_finances"."customer_id" is null and "recreio"."account_closure_finances"."provider_customer_id" is null) or ("recreio"."account_closure_finances"."customer_id" is not null and "recreio"."account_closure_finances"."provider_customer_id" ~ '^cus_[A-Za-z0-9_]{3,124}$'))) is true),
	CONSTRAINT "recreio_account_closure_finance_state" CHECK ("recreio"."account_closure_finances"."state" in ('pending','attempted','waiting','confirmed','review') and ("recreio"."account_closure_finances"."state"<>'pending' or "recreio"."account_closure_finances"."request_started_at" is null) and ("recreio"."account_closure_finances"."state" not in ('attempted','waiting','confirmed') or "recreio"."account_closure_finances"."request_started_at" is not null)),
	CONSTRAINT "recreio_account_closure_finance_review" CHECK ((("recreio"."account_closure_finances"."state"='review' and "recreio"."account_closure_finances"."review_code" in ('provider_unavailable','scope_changed','foreign_contract','namespace_mismatch','invalid_evidence','ledger_unavailable')) or ("recreio"."account_closure_finances"."state"<>'review' and "recreio"."account_closure_finances"."review_code" is null)) is true),
	CONSTRAINT "recreio_account_closure_finance_confirmation" CHECK (((
      "recreio"."account_closure_finances"."state"='confirmed' and "recreio"."account_closure_finances"."observation_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."account_closure_finances"."observed_at">="recreio"."account_closure_finances"."request_started_at" and "recreio"."account_closure_finances"."confirmed_at">="recreio"."account_closure_finances"."observed_at" and "recreio"."account_closure_finances"."updated_at">="recreio"."account_closure_finances"."confirmed_at" and
      (("recreio"."account_closure_finances"."customer_id" is null and "recreio"."account_closure_finances"."result"='no_customer') or ("recreio"."account_closure_finances"."customer_id" is not null and "recreio"."account_closure_finances"."result"='provider_inventory'))
    ) or ("recreio"."account_closure_finances"."state"<>'confirmed' and "recreio"."account_closure_finances"."result" is null and "recreio"."account_closure_finances"."observation_sha256" is null and "recreio"."account_closure_finances"."observed_at" is null and "recreio"."account_closure_finances"."confirmed_at" is null)) is true),
	CONSTRAINT "recreio_account_closure_finance_lease" CHECK ((("recreio"."account_closure_finances"."lease_token" is null and "recreio"."account_closure_finances"."lease_until" is null) or ("recreio"."account_closure_finances"."lease_token" is not null and "recreio"."account_closure_finances"."lease_until">"recreio"."account_closure_finances"."updated_at" and "recreio"."account_closure_finances"."state"<>'confirmed')) is true),
	CONSTRAINT "recreio_account_closure_finance_times" CHECK ("recreio"."account_closure_finances"."updated_at">="recreio"."account_closure_finances"."created_at" and "recreio"."account_closure_finances"."next_attempt_at">="recreio"."account_closure_finances"."created_at" and (("recreio"."account_closure_finances"."request_started_at" is null and "recreio"."account_closure_finances"."attempts"=0) or ("recreio"."account_closure_finances"."request_started_at" is not null and "recreio"."account_closure_finances"."request_started_at">="recreio"."account_closure_finances"."created_at" and "recreio"."account_closure_finances"."request_started_at"<="recreio"."account_closure_finances"."updated_at" and "recreio"."account_closure_finances"."attempts">=1)) and isfinite("recreio"."account_closure_finances"."created_at") and isfinite("recreio"."account_closure_finances"."updated_at") and isfinite("recreio"."account_closure_finances"."next_attempt_at") and ("recreio"."account_closure_finances"."request_started_at" is null or isfinite("recreio"."account_closure_finances"."request_started_at")) and ("recreio"."account_closure_finances"."lease_until" is null or isfinite("recreio"."account_closure_finances"."lease_until")) and ("recreio"."account_closure_finances"."observed_at" is null or isfinite("recreio"."account_closure_finances"."observed_at")) and ("recreio"."account_closure_finances"."confirmed_at" is null or isfinite("recreio"."account_closure_finances"."confirmed_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."account_closure_finances" ADD CONSTRAINT "account_closure_finances_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "billing"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."account_closure_finances" ADD CONSTRAINT "recreio_account_closure_finance_operation" FOREIGN KEY ("operation_id","requester_user_id","operation_kind") REFERENCES "recreio"."rights_operations"("id","requester_user_id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_account_closure_finance_due" ON "recreio"."account_closure_finances" USING btree ("state","next_attempt_at","operation_id") WHERE "recreio"."account_closure_finances"."state"<>'confirmed';--> statement-breakpoint
ALTER TABLE "recreio"."account_participations" ADD CONSTRAINT "recreio_account_participation_finite" CHECK (isfinite("recreio"."account_participations"."updated_at") and ("recreio"."account_participations"."closing_at" is null or isfinite("recreio"."account_participations"."closing_at")) and ("recreio"."account_participations"."closed_at" is null or isfinite("recreio"."account_participations"."closed_at")));