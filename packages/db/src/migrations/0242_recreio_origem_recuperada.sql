CREATE TABLE "recreio"."rights_recovery_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ledger_id" uuid NOT NULL,
	"frozen_head_sha256" text NOT NULL,
	"capture_sha256" text NOT NULL,
	"frozen_epoch" integer NOT NULL,
	"frozen_signing_key_id" text NOT NULL,
	"next_signing_key_id" text NOT NULL,
	"source" text NOT NULL,
	"state" text DEFAULT 'replaying' NOT NULL,
	"receipt_sha256" text,
	"review_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "recreio_rights_recovery_run_ledger" UNIQUE("id","ledger_id"),
	CONSTRAINT "recreio_rights_recovery_fence" UNIQUE("ledger_id","frozen_head_sha256"),
	CONSTRAINT "recreio_rights_recovery_hashes" CHECK ("recreio"."rights_recovery_runs"."frozen_head_sha256" ~ '^[a-f0-9]{64}$' and
    "recreio"."rights_recovery_runs"."capture_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."rights_recovery_runs"."source" ~ '^[a-f0-9]{40}$' and
    ("recreio"."rights_recovery_runs"."receipt_sha256" is null or "recreio"."rights_recovery_runs"."receipt_sha256" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "recreio_rights_recovery_keys" CHECK ("recreio"."rights_recovery_runs"."frozen_epoch" between 0 and 14 and
    "recreio"."rights_recovery_runs"."frozen_signing_key_id" ~ '^[A-Za-z0-9._-]{1,64}$' and "recreio"."rights_recovery_runs"."next_signing_key_id" ~ '^[A-Za-z0-9._-]{1,64}$' and
    "recreio"."rights_recovery_runs"."frozen_signing_key_id"<>"recreio"."rights_recovery_runs"."next_signing_key_id"),
	CONSTRAINT "recreio_rights_recovery_state" CHECK (
    ("recreio"."rights_recovery_runs"."state"='replaying' and "recreio"."rights_recovery_runs"."receipt_sha256" is null and "recreio"."rights_recovery_runs"."verified_at" is null and "recreio"."rights_recovery_runs"."review_code" is null) or
    ("recreio"."rights_recovery_runs"."state"='verified' and "recreio"."rights_recovery_runs"."receipt_sha256" is not null and "recreio"."rights_recovery_runs"."verified_at" is not null and "recreio"."rights_recovery_runs"."review_code" is null) or
    ("recreio"."rights_recovery_runs"."state"='review' and "recreio"."rights_recovery_runs"."receipt_sha256" is null and "recreio"."rights_recovery_runs"."verified_at" is null and "recreio"."rights_recovery_runs"."review_code" is not null and
      "recreio"."rights_recovery_runs"."review_code" in ('integrity','scope','identity','finance','dependency','execution'))),
	CONSTRAINT "recreio_rights_recovery_times" CHECK (isfinite("recreio"."rights_recovery_runs"."created_at") and
    ("recreio"."rights_recovery_runs"."verified_at" is null or (isfinite("recreio"."rights_recovery_runs"."verified_at") and "recreio"."rights_recovery_runs"."verified_at">="recreio"."rights_recovery_runs"."created_at")))
);
--> statement-breakpoint
CREATE TABLE "recreio"."rights_recovery_sources" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"requester_reference" text NOT NULL,
	"kind" text NOT NULL,
	"plan_sha256" text NOT NULL,
	"plan" jsonb NOT NULL,
	"world_map" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_rights_recovery_source_scope" UNIQUE("operation_id","requester_reference","plan_sha256","kind","ledger_id"),
	CONSTRAINT "recreio_rights_recovery_source_kind" CHECK ("recreio"."rights_recovery_sources"."kind" in ('retirar_perfil','encerrar_conta')),
	CONSTRAINT "recreio_rights_recovery_source_reference" CHECK (char_length("recreio"."rights_recovery_sources"."requester_reference") between 1 and 256 and
    "recreio"."rights_recovery_sources"."plan_sha256" ~ '^[a-f0-9]{64}$' and isfinite("recreio"."rights_recovery_sources"."imported_at")),
	CONSTRAINT "recreio_rights_recovery_source_plan" CHECK (jsonb_typeof("recreio"."rights_recovery_sources"."plan")='object' and pg_column_size("recreio"."rights_recovery_sources"."plan") between 2 and 262144),
	CONSTRAINT "recreio_rights_recovery_source_worlds" CHECK (jsonb_typeof("recreio"."rights_recovery_sources"."world_map")='array' and
    jsonb_array_length("recreio"."rights_recovery_sources"."world_map") between 0 and 512 and pg_column_size("recreio"."rights_recovery_sources"."world_map")<=131072)
);
--> statement-breakpoint
ALTER TABLE "recreio"."rights_operations" ALTER COLUMN "preparation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."rights_operations" ADD COLUMN "recovery_source_id" uuid;--> statement-breakpoint
ALTER TABLE "recreio"."rights_recovery_sources" ADD CONSTRAINT "recreio_rights_recovery_source_run" FOREIGN KEY ("run_id","ledger_id") REFERENCES "recreio"."rights_recovery_runs"("id","ledger_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_rights_recovery_source_by_run" ON "recreio"."rights_recovery_sources" USING btree ("run_id","operation_id");--> statement-breakpoint
CREATE INDEX "recreio_rights_recovery_source_actor" ON "recreio"."rights_recovery_sources" USING btree ("requester_reference","operation_id");--> statement-breakpoint
ALTER TABLE "recreio"."rights_operations" ADD CONSTRAINT "recreio_rights_operation_recovery_scope" FOREIGN KEY ("recovery_source_id","requester_user_id","plan_sha256","kind","ledger_id") REFERENCES "recreio"."rights_recovery_sources"("operation_id","requester_reference","plan_sha256","kind","ledger_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_operations" ADD CONSTRAINT "recreio_rights_operation_origin" CHECK (
      ("recreio"."rights_operations"."preparation_id" is not null and "recreio"."rights_operations"."recovery_source_id" is null) or
      ("recreio"."rights_operations"."preparation_id" is null and "recreio"."rights_operations"."recovery_source_id" is not null and "recreio"."rights_operations"."recovery_source_id"="recreio"."rights_operations"."id" and "recreio"."rights_operations"."state"<>'publishing'));