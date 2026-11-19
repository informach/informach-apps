CREATE TABLE "recreio"."snapshot_object_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_reference" uuid NOT NULL,
	"snapshot_id" uuid,
	"space_id" uuid NOT NULL,
	"plaintext_sha256" text NOT NULL,
	"plaintext_bytes" integer NOT NULL,
	"storage_scope" text NOT NULL,
	"bucket_id" uuid NOT NULL,
	"bucket_name" text NOT NULL,
	"object_key" text NOT NULL,
	"cipher_sha256" text NOT NULL,
	"cipher_bytes" integer NOT NULL,
	"encryption_key_id" text NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"envelope" "bytea",
	"state" text DEFAULT 'prepared' NOT NULL,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"detached_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	CONSTRAINT "recreio_snapshot_object_bucket_key" UNIQUE("bucket_id","object_key"),
	CONSTRAINT "recreio_snapshot_object_reference" CHECK (("recreio"."snapshot_object_deliveries"."snapshot_id" is null or "recreio"."snapshot_object_deliveries"."snapshot_id"="recreio"."snapshot_object_deliveries"."snapshot_reference") and
      (("recreio"."snapshot_object_deliveries"."snapshot_id" is null)=("recreio"."snapshot_object_deliveries"."detached_at" is not null))),
	CONSTRAINT "recreio_snapshot_object_target" CHECK ("recreio"."snapshot_object_deliveries"."storage_scope" in ('qualification','production') and
      "recreio"."snapshot_object_deliveries"."bucket_name" ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' and
      "recreio"."snapshot_object_deliveries"."object_key"='recreio/v1/fotografia/' || "recreio"."snapshot_object_deliveries"."space_id"::text || '/' || "recreio"."snapshot_object_deliveries"."cipher_sha256"),
	CONSTRAINT "recreio_snapshot_object_crypto" CHECK ("recreio"."snapshot_object_deliveries"."format_version"=1 and
      "recreio"."snapshot_object_deliveries"."plaintext_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."snapshot_object_deliveries"."cipher_sha256" ~ '^[a-f0-9]{64}$' and
      "recreio"."snapshot_object_deliveries"."plaintext_bytes" between 0 and 268435456 and
      "recreio"."snapshot_object_deliveries"."cipher_bytes" between "recreio"."snapshot_object_deliveries"."plaintext_bytes"+40 and "recreio"."snapshot_object_deliveries"."plaintext_bytes"+1024 and
      "recreio"."snapshot_object_deliveries"."encryption_key_id" ~ '^[A-Za-z0-9._-]{1,64}$' and
      ("recreio"."snapshot_object_deliveries"."envelope" is null or octet_length("recreio"."snapshot_object_deliveries"."envelope")="recreio"."snapshot_object_deliveries"."cipher_bytes")),
	CONSTRAINT "recreio_snapshot_object_lifecycle" CHECK (
      ("recreio"."snapshot_object_deliveries"."state"='prepared' and "recreio"."snapshot_object_deliveries"."snapshot_id" is not null and "recreio"."snapshot_object_deliveries"."verified_at" is null and "recreio"."snapshot_object_deliveries"."retired_at" is null and "recreio"."snapshot_object_deliveries"."envelope" is not null) or
      ("recreio"."snapshot_object_deliveries"."state"='verified' and "recreio"."snapshot_object_deliveries"."snapshot_id" is not null and "recreio"."snapshot_object_deliveries"."verified_at" is not null and "recreio"."snapshot_object_deliveries"."retired_at" is null and "recreio"."snapshot_object_deliveries"."envelope" is null) or
      ("recreio"."snapshot_object_deliveries"."state"='retiring' and "recreio"."snapshot_object_deliveries"."snapshot_id" is null and "recreio"."snapshot_object_deliveries"."retired_at" is null and "recreio"."snapshot_object_deliveries"."envelope" is null) or
      ("recreio"."snapshot_object_deliveries"."state"='retired' and "recreio"."snapshot_object_deliveries"."snapshot_id" is null and "recreio"."snapshot_object_deliveries"."retired_at" is not null and "recreio"."snapshot_object_deliveries"."envelope" is null) or
      ("recreio"."snapshot_object_deliveries"."state"='review' and "recreio"."snapshot_object_deliveries"."retired_at" is null and ("recreio"."snapshot_object_deliveries"."verified_at" is not null or "recreio"."snapshot_object_deliveries"."detached_at" is not null or "recreio"."snapshot_object_deliveries"."envelope" is not null))),
	CONSTRAINT "recreio_snapshot_object_review" CHECK ((("recreio"."snapshot_object_deliveries"."state"='review')=("recreio"."snapshot_object_deliveries"."review_reason" is not null)) and
      ("recreio"."snapshot_object_deliveries"."review_reason" is null or "recreio"."snapshot_object_deliveries"."review_reason" in ('integrity','missing_key','unconfirmed_write','scope_changed','delete_unconfirmed'))),
	CONSTRAINT "recreio_snapshot_object_lease" CHECK (("recreio"."snapshot_object_deliveries"."lease_token" is null and "recreio"."snapshot_object_deliveries"."lease_until" is null) or
      ("recreio"."snapshot_object_deliveries"."lease_token" is not null and "recreio"."snapshot_object_deliveries"."lease_until" is not null and "recreio"."snapshot_object_deliveries"."last_attempt_at" is not null and
      "recreio"."snapshot_object_deliveries"."lease_until">"recreio"."snapshot_object_deliveries"."last_attempt_at" and "recreio"."snapshot_object_deliveries"."state" in ('prepared','retiring'))),
	CONSTRAINT "recreio_snapshot_object_attempts" CHECK ("recreio"."snapshot_object_deliveries"."attempt_count" between 0 and 2147483646 and
      (("recreio"."snapshot_object_deliveries"."attempt_count"=0 and "recreio"."snapshot_object_deliveries"."last_attempt_at" is null) or ("recreio"."snapshot_object_deliveries"."attempt_count">0 and "recreio"."snapshot_object_deliveries"."last_attempt_at" is not null))),
	CONSTRAINT "recreio_snapshot_object_times" CHECK (isfinite("recreio"."snapshot_object_deliveries"."created_at") and isfinite("recreio"."snapshot_object_deliveries"."next_attempt_at") and
      ("recreio"."snapshot_object_deliveries"."verified_at" is null or (isfinite("recreio"."snapshot_object_deliveries"."verified_at") and "recreio"."snapshot_object_deliveries"."verified_at">="recreio"."snapshot_object_deliveries"."created_at")) and
      ("recreio"."snapshot_object_deliveries"."detached_at" is null or (isfinite("recreio"."snapshot_object_deliveries"."detached_at") and "recreio"."snapshot_object_deliveries"."detached_at">="recreio"."snapshot_object_deliveries"."created_at")) and
      ("recreio"."snapshot_object_deliveries"."retired_at" is null or (isfinite("recreio"."snapshot_object_deliveries"."retired_at") and "recreio"."snapshot_object_deliveries"."retired_at">="recreio"."snapshot_object_deliveries"."detached_at")) and
      ("recreio"."snapshot_object_deliveries"."last_attempt_at" is null or (isfinite("recreio"."snapshot_object_deliveries"."last_attempt_at") and "recreio"."snapshot_object_deliveries"."last_attempt_at">="recreio"."snapshot_object_deliveries"."created_at")) and
      ("recreio"."snapshot_object_deliveries"."lease_until" is null or isfinite("recreio"."snapshot_object_deliveries"."lease_until")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."snapshot_object_deliveries" ADD CONSTRAINT "snapshot_object_deliveries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."snapshot_object_deliveries" ADD CONSTRAINT "recreio_snapshot_object_content" FOREIGN KEY ("snapshot_id","space_id","plaintext_sha256","plaintext_bytes") REFERENCES "recreio"."space_snapshots"("id","space_id","sha256","byte_size") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_snapshot_object_link" ON "recreio"."snapshot_object_deliveries" USING btree ("snapshot_id") WHERE "recreio"."snapshot_object_deliveries"."snapshot_id" is not null;--> statement-breakpoint
CREATE INDEX "recreio_snapshot_object_due" ON "recreio"."snapshot_object_deliveries" USING btree ("state","next_attempt_at","id");--> statement-breakpoint
CREATE INDEX "recreio_snapshot_object_history" ON "recreio"."snapshot_object_deliveries" USING btree ("snapshot_reference","created_at");--> statement-breakpoint
CREATE INDEX "recreio_snapshot_object_space" ON "recreio"."snapshot_object_deliveries" USING btree ("space_id","state");