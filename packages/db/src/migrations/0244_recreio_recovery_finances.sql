CREATE TABLE "recreio"."rights_recovery_finances" (
	"run_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"requester_reference" text NOT NULL,
	"kind" text DEFAULT 'encerrar_conta' NOT NULL,
	"plan_sha256" text NOT NULL,
	"provider_mode" text NOT NULL,
	"state" text NOT NULL,
	"attempts" integer NOT NULL,
	"attempt_token" uuid NOT NULL,
	"source_sha256" text NOT NULL,
	"historical_confirmation_sha256" text NOT NULL,
	"result" text,
	"observation_sha256" text,
	"receipt_sha256" text,
	"review_code" text,
	"attempted_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rights_recovery_finances_run_id_operation_id_pk" PRIMARY KEY("run_id","operation_id"),
	CONSTRAINT "recreio_recovery_finance_scope" CHECK ("recreio"."rights_recovery_finances"."kind"='encerrar_conta' and "recreio"."rights_recovery_finances"."provider_mode" in ('dev','prod') and char_length("recreio"."rights_recovery_finances"."requester_reference") between 1 and 256 and "recreio"."rights_recovery_finances"."attempts" between 1 and 2147483647),
	CONSTRAINT "recreio_recovery_finance_hashes" CHECK ("recreio"."rights_recovery_finances"."plan_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."rights_recovery_finances"."source_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."rights_recovery_finances"."historical_confirmation_sha256" ~ '^[a-f0-9]{64}$' and ("recreio"."rights_recovery_finances"."observation_sha256" is null or "recreio"."rights_recovery_finances"."observation_sha256" ~ '^[a-f0-9]{64}$') and ("recreio"."rights_recovery_finances"."receipt_sha256" is null or "recreio"."rights_recovery_finances"."receipt_sha256" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "recreio_recovery_finance_state" CHECK (((
      "recreio"."rights_recovery_finances"."state"='attempted' and "recreio"."rights_recovery_finances"."result" is null and "recreio"."rights_recovery_finances"."observation_sha256" is null and "recreio"."rights_recovery_finances"."receipt_sha256" is null and "recreio"."rights_recovery_finances"."observed_at" is null and "recreio"."rights_recovery_finances"."review_code" is null
    ) or (
      "recreio"."rights_recovery_finances"."state"='current' and "recreio"."rights_recovery_finances"."receipt_sha256" is not null and "recreio"."rights_recovery_finances"."observed_at" is not null and "recreio"."rights_recovery_finances"."review_code" is null and
      (("recreio"."rights_recovery_finances"."result"='provider_inventory' and "recreio"."rights_recovery_finances"."observation_sha256" is not null) or ("recreio"."rights_recovery_finances"."result"='no_customer' and "recreio"."rights_recovery_finances"."observation_sha256" is null))
    ) or (
      "recreio"."rights_recovery_finances"."state"='review' and "recreio"."rights_recovery_finances"."result" is null and "recreio"."rights_recovery_finances"."observation_sha256" is null and "recreio"."rights_recovery_finances"."receipt_sha256" is null and "recreio"."rights_recovery_finances"."observed_at" is null and
      "recreio"."rights_recovery_finances"."review_code" in ('provider_unavailable','scope_changed','foreign_contract','namespace_mismatch','invalid_evidence','ledger_unavailable','technical_failure')
    )) is true),
	CONSTRAINT "recreio_recovery_finance_times" CHECK (isfinite("recreio"."rights_recovery_finances"."created_at") and isfinite("recreio"."rights_recovery_finances"."attempted_at") and isfinite("recreio"."rights_recovery_finances"."updated_at") and "recreio"."rights_recovery_finances"."attempted_at">="recreio"."rights_recovery_finances"."created_at" and "recreio"."rights_recovery_finances"."updated_at">="recreio"."rights_recovery_finances"."attempted_at" and ("recreio"."rights_recovery_finances"."observed_at" is null or (isfinite("recreio"."rights_recovery_finances"."observed_at") and "recreio"."rights_recovery_finances"."observed_at">="recreio"."rights_recovery_finances"."attempted_at" and "recreio"."rights_recovery_finances"."observed_at"<="recreio"."rights_recovery_finances"."updated_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."rights_recovery_finances" ADD CONSTRAINT "recreio_recovery_finance_evaluation" FOREIGN KEY ("run_id","operation_id") REFERENCES "recreio"."rights_recovery_evaluations"("run_id","operation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_recovery_finances" ADD CONSTRAINT "recreio_recovery_finance_run" FOREIGN KEY ("run_id","ledger_id") REFERENCES "recreio"."rights_recovery_runs"("id","ledger_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_recovery_finances" ADD CONSTRAINT "recreio_recovery_finance_source" FOREIGN KEY ("operation_id","requester_reference","plan_sha256","kind","ledger_id") REFERENCES "recreio"."rights_recovery_sources"("operation_id","requester_reference","plan_sha256","kind","ledger_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_recovery_finance_state" ON "recreio"."rights_recovery_finances" USING btree ("run_id","state","operation_id");--> statement-breakpoint
CREATE INDEX "recreio_recovery_finance_requester" ON "recreio"."rights_recovery_finances" USING btree ("requester_reference","run_id","operation_id");