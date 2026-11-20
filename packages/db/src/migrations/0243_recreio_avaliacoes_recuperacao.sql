CREATE TABLE "recreio"."rights_recovery_evaluations" (
	"run_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"requester_reference" text NOT NULL,
	"kind" text NOT NULL,
	"plan_sha256" text NOT NULL,
	"world_map" jsonb NOT NULL,
	"state" text DEFAULT 'staged' NOT NULL,
	"origin" text,
	"preparation_reference" uuid,
	"recovery_source_reference" uuid,
	"admitted_head_sha256" text,
	"intent_sha256" text,
	"ready_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"review_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rights_recovery_evaluations_run_id_operation_id_pk" PRIMARY KEY("run_id","operation_id"),
	CONSTRAINT "recreio_rights_recovery_evaluation_scope" CHECK (
        "recreio"."rights_recovery_evaluations"."kind" in ('retirar_perfil','encerrar_conta') and char_length("recreio"."rights_recovery_evaluations"."requester_reference") between 1 and 256 and
        "recreio"."rights_recovery_evaluations"."plan_sha256" ~ '^[a-f0-9]{64}$' and
        ("recreio"."rights_recovery_evaluations"."admitted_head_sha256" is null or "recreio"."rights_recovery_evaluations"."admitted_head_sha256" ~ '^[a-f0-9]{64}$') and
        ("recreio"."rights_recovery_evaluations"."intent_sha256" is null or "recreio"."rights_recovery_evaluations"."intent_sha256" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "recreio_rights_recovery_evaluation_worlds" CHECK (jsonb_typeof("recreio"."rights_recovery_evaluations"."world_map")='array' and
        jsonb_array_length("recreio"."rights_recovery_evaluations"."world_map") between 0 and 512 and pg_column_size("recreio"."rights_recovery_evaluations"."world_map")<=131072),
	CONSTRAINT "recreio_rights_recovery_evaluation_state" CHECK (
        ("recreio"."rights_recovery_evaluations"."state"='staged' and ("recreio"."rights_recovery_evaluations"."origin" is null and "recreio"."rights_recovery_evaluations"."ready_at" is null and
      "recreio"."rights_recovery_evaluations"."admitted_head_sha256" is null and "recreio"."rights_recovery_evaluations"."intent_sha256" is null and
      "recreio"."rights_recovery_evaluations"."preparation_reference" is null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is null) and "recreio"."rights_recovery_evaluations"."verified_at" is null and "recreio"."rights_recovery_evaluations"."review_code" is null) or
        ("recreio"."rights_recovery_evaluations"."state"='ready' and ("recreio"."rights_recovery_evaluations"."origin" is not null and "recreio"."rights_recovery_evaluations"."ready_at" is not null and
      "recreio"."rights_recovery_evaluations"."admitted_head_sha256" is not null and "recreio"."rights_recovery_evaluations"."intent_sha256" is not null and
      (("recreio"."rights_recovery_evaluations"."origin"='native' and "recreio"."rights_recovery_evaluations"."preparation_reference" is not null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is null) or
       ("recreio"."rights_recovery_evaluations"."origin"='recovered' and "recreio"."rights_recovery_evaluations"."preparation_reference" is null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is not null and
        "recreio"."rights_recovery_evaluations"."recovery_source_reference"="recreio"."rights_recovery_evaluations"."operation_id"))) and "recreio"."rights_recovery_evaluations"."verified_at" is null and "recreio"."rights_recovery_evaluations"."review_code" is null) or
        ("recreio"."rights_recovery_evaluations"."state"='verified' and ("recreio"."rights_recovery_evaluations"."origin" is not null and "recreio"."rights_recovery_evaluations"."ready_at" is not null and
      "recreio"."rights_recovery_evaluations"."admitted_head_sha256" is not null and "recreio"."rights_recovery_evaluations"."intent_sha256" is not null and
      (("recreio"."rights_recovery_evaluations"."origin"='native' and "recreio"."rights_recovery_evaluations"."preparation_reference" is not null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is null) or
       ("recreio"."rights_recovery_evaluations"."origin"='recovered' and "recreio"."rights_recovery_evaluations"."preparation_reference" is null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is not null and
        "recreio"."rights_recovery_evaluations"."recovery_source_reference"="recreio"."rights_recovery_evaluations"."operation_id"))) and "recreio"."rights_recovery_evaluations"."verified_at" is not null and "recreio"."rights_recovery_evaluations"."review_code" is null) or
        ("recreio"."rights_recovery_evaluations"."state"='review' and (("recreio"."rights_recovery_evaluations"."origin" is null and "recreio"."rights_recovery_evaluations"."ready_at" is null and
      "recreio"."rights_recovery_evaluations"."admitted_head_sha256" is null and "recreio"."rights_recovery_evaluations"."intent_sha256" is null and
      "recreio"."rights_recovery_evaluations"."preparation_reference" is null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is null) or ("recreio"."rights_recovery_evaluations"."origin" is not null and "recreio"."rights_recovery_evaluations"."ready_at" is not null and
      "recreio"."rights_recovery_evaluations"."admitted_head_sha256" is not null and "recreio"."rights_recovery_evaluations"."intent_sha256" is not null and
      (("recreio"."rights_recovery_evaluations"."origin"='native' and "recreio"."rights_recovery_evaluations"."preparation_reference" is not null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is null) or
       ("recreio"."rights_recovery_evaluations"."origin"='recovered' and "recreio"."rights_recovery_evaluations"."preparation_reference" is null and "recreio"."rights_recovery_evaluations"."recovery_source_reference" is not null and
        "recreio"."rights_recovery_evaluations"."recovery_source_reference"="recreio"."rights_recovery_evaluations"."operation_id")))) and "recreio"."rights_recovery_evaluations"."verified_at" is null and
          "recreio"."rights_recovery_evaluations"."review_code" is not null and "recreio"."rights_recovery_evaluations"."review_code" in ('integrity','scope','identity','finance','dependency','execution'))),
	CONSTRAINT "recreio_rights_recovery_evaluation_times" CHECK (isfinite("recreio"."rights_recovery_evaluations"."created_at") and
        ("recreio"."rights_recovery_evaluations"."ready_at" is null or (isfinite("recreio"."rights_recovery_evaluations"."ready_at") and "recreio"."rights_recovery_evaluations"."ready_at">="recreio"."rights_recovery_evaluations"."created_at")) and
        ("recreio"."rights_recovery_evaluations"."verified_at" is null or (isfinite("recreio"."rights_recovery_evaluations"."verified_at") and "recreio"."rights_recovery_evaluations"."ready_at" is not null and "recreio"."rights_recovery_evaluations"."verified_at">="recreio"."rights_recovery_evaluations"."ready_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."rights_recovery_evaluations" ADD CONSTRAINT "recreio_rights_recovery_evaluation_run" FOREIGN KEY ("run_id","ledger_id") REFERENCES "recreio"."rights_recovery_runs"("id","ledger_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_recovery_evaluations" ADD CONSTRAINT "recreio_rights_recovery_evaluation_source" FOREIGN KEY ("operation_id","requester_reference","plan_sha256","kind","ledger_id") REFERENCES "recreio"."rights_recovery_sources"("operation_id","requester_reference","plan_sha256","kind","ledger_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_rights_recovery_evaluation_queue" ON "recreio"."rights_recovery_evaluations" USING btree ("run_id","state","operation_id");