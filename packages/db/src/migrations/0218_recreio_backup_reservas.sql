CREATE TABLE "recreio"."backup_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_scope" text NOT NULL,
	"bucket_id" uuid NOT NULL,
	"bucket_name" text NOT NULL,
	"state" text DEFAULT 'preparing' NOT NULL,
	"inventory_sha256" text,
	"object_count" integer,
	"object_bytes" bigint,
	"archive_sha256" text,
	"archive_bytes" bigint,
	"cipher_sha256" text,
	"cipher_bytes" bigint,
	"encryption_key_id" text,
	"object_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_at" timestamp with time zone,
	"sealed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	"absence_confirmed_at" timestamp with time zone,
	"review_reason" text,
	CONSTRAINT "recreio_backup_capture_target" CHECK ("recreio"."backup_captures"."storage_scope" in ('qualification','production') and "recreio"."backup_captures"."bucket_name" ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'),
	CONSTRAINT "recreio_backup_capture_inventory" CHECK (
    ("recreio"."backup_captures"."captured_at" is null and "recreio"."backup_captures"."inventory_sha256" is null and "recreio"."backup_captures"."object_count" is null and "recreio"."backup_captures"."object_bytes" is null) or
    ("recreio"."backup_captures"."captured_at" is not null and "recreio"."backup_captures"."inventory_sha256" is not null and "recreio"."backup_captures"."inventory_sha256" ~ '^[a-f0-9]{64}$' and
      "recreio"."backup_captures"."object_count" is not null and "recreio"."backup_captures"."object_count" between 0 and 1000000 and
      "recreio"."backup_captures"."object_bytes" is not null and "recreio"."backup_captures"."object_bytes" between 0 and 68719476736)),
	CONSTRAINT "recreio_backup_capture_archive" CHECK (
    ("recreio"."backup_captures"."sealed_at" is null and "recreio"."backup_captures"."archive_sha256" is null and "recreio"."backup_captures"."archive_bytes" is null and "recreio"."backup_captures"."cipher_sha256" is null and
      "recreio"."backup_captures"."cipher_bytes" is null and "recreio"."backup_captures"."encryption_key_id" is null and "recreio"."backup_captures"."object_key" is null) or
    ("recreio"."backup_captures"."sealed_at" is not null and "recreio"."backup_captures"."captured_at" is not null and
      "recreio"."backup_captures"."archive_sha256" is not null and "recreio"."backup_captures"."archive_sha256" ~ '^[a-f0-9]{64}$' and
      "recreio"."backup_captures"."archive_bytes" is not null and "recreio"."backup_captures"."archive_bytes" between 0 and 68719476736 and
      "recreio"."backup_captures"."cipher_sha256" is not null and "recreio"."backup_captures"."cipher_sha256" ~ '^[a-f0-9]{64}$' and
      "recreio"."backup_captures"."cipher_bytes" is not null and "recreio"."backup_captures"."cipher_bytes" between "recreio"."backup_captures"."archive_bytes"+40 and "recreio"."backup_captures"."archive_bytes"+1024 and
      "recreio"."backup_captures"."encryption_key_id" is not null and "recreio"."backup_captures"."encryption_key_id" ~ '^[A-Za-z0-9._-]{1,64}$' and
      "recreio"."backup_captures"."object_key" is not null and "recreio"."backup_captures"."object_key"='recreio/v1/backup/' || "recreio"."backup_captures"."id"::text || '/' || "recreio"."backup_captures"."cipher_sha256")),
	CONSTRAINT "recreio_backup_capture_lifecycle" CHECK (
    ("recreio"."backup_captures"."state"='preparing' and "recreio"."backup_captures"."captured_at" is null and "recreio"."backup_captures"."sealed_at" is null and "recreio"."backup_captures"."verified_at" is null and "recreio"."backup_captures"."abandoned_at" is null) or
    ("recreio"."backup_captures"."state"='captured' and "recreio"."backup_captures"."captured_at" is not null and "recreio"."backup_captures"."sealed_at" is null and "recreio"."backup_captures"."verified_at" is null and "recreio"."backup_captures"."abandoned_at" is null) or
    ("recreio"."backup_captures"."state"='sealed' and "recreio"."backup_captures"."sealed_at" is not null and "recreio"."backup_captures"."verified_at" is null and "recreio"."backup_captures"."abandoned_at" is null) or
    ("recreio"."backup_captures"."state"='verified' and "recreio"."backup_captures"."sealed_at" is not null and "recreio"."backup_captures"."verified_at" is not null and "recreio"."backup_captures"."abandoned_at" is null) or
    ("recreio"."backup_captures"."state"='abandoned' and "recreio"."backup_captures"."verified_at" is null and "recreio"."backup_captures"."abandoned_at" is not null and
      ("recreio"."backup_captures"."sealed_at" is null or "recreio"."backup_captures"."absence_confirmed_at" is not null)) or
    ("recreio"."backup_captures"."state"='review' and "recreio"."backup_captures"."verified_at" is null and "recreio"."backup_captures"."abandoned_at" is null)),
	CONSTRAINT "recreio_backup_capture_review" CHECK (
    (("recreio"."backup_captures"."state"='review')=("recreio"."backup_captures"."review_reason" is not null)) and
    ("recreio"."backup_captures"."review_reason" is null or "recreio"."backup_captures"."review_reason" in ('integrity','missing_key','source_lost','destination_changed','unconfirmed_write','delete_unconfirmed'))),
	CONSTRAINT "recreio_backup_capture_times" CHECK (
    isfinite("recreio"."backup_captures"."created_at") and
    ("recreio"."backup_captures"."captured_at" is null or (isfinite("recreio"."backup_captures"."captured_at") and "recreio"."backup_captures"."captured_at">="recreio"."backup_captures"."created_at")) and
    ("recreio"."backup_captures"."sealed_at" is null or (isfinite("recreio"."backup_captures"."sealed_at") and "recreio"."backup_captures"."sealed_at">="recreio"."backup_captures"."captured_at")) and
    ("recreio"."backup_captures"."verified_at" is null or (isfinite("recreio"."backup_captures"."verified_at") and "recreio"."backup_captures"."verified_at">="recreio"."backup_captures"."sealed_at")) and
    ("recreio"."backup_captures"."absence_confirmed_at" is null or ("recreio"."backup_captures"."sealed_at" is not null and isfinite("recreio"."backup_captures"."absence_confirmed_at") and "recreio"."backup_captures"."absence_confirmed_at">="recreio"."backup_captures"."sealed_at")) and
    ("recreio"."backup_captures"."abandoned_at" is null or (isfinite("recreio"."backup_captures"."abandoned_at") and "recreio"."backup_captures"."abandoned_at">="recreio"."backup_captures"."created_at" and
      ("recreio"."backup_captures"."absence_confirmed_at" is null or "recreio"."backup_captures"."abandoned_at">="recreio"."backup_captures"."absence_confirmed_at")))),
	CONSTRAINT "recreio_backup_capture_absence" CHECK ("recreio"."backup_captures"."absence_confirmed_at" is null or "recreio"."backup_captures"."state" in ('sealed','abandoned','review'))
);
--> statement-breakpoint
CREATE TABLE "recreio"."backup_object_holds" (
	"capture_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"reference_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text,
	CONSTRAINT "recreio_backup_object_hold_pk" PRIMARY KEY("capture_id","delivery_id"),
	CONSTRAINT "recreio_backup_object_hold_reference" CHECK ("recreio"."backup_object_holds"."reference_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_backup_object_hold_release" CHECK (
    ("recreio"."backup_object_holds"."released_at" is null and "recreio"."backup_object_holds"."release_reason" is null) or
    ("recreio"."backup_object_holds"."released_at" is not null and "recreio"."backup_object_holds"."release_reason" is not null and "recreio"."backup_object_holds"."release_reason" in ('stored_archive','abandoned'))),
	CONSTRAINT "recreio_backup_object_hold_times" CHECK (isfinite("recreio"."backup_object_holds"."created_at") and ("recreio"."backup_object_holds"."released_at" is null or (isfinite("recreio"."backup_object_holds"."released_at") and "recreio"."backup_object_holds"."released_at">="recreio"."backup_object_holds"."created_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."backup_object_holds" ADD CONSTRAINT "backup_object_holds_capture_id_backup_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "recreio"."backup_captures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."backup_object_holds" ADD CONSTRAINT "backup_object_holds_delivery_id_snapshot_object_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "recreio"."snapshot_object_deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_backup_capture_state" ON "recreio"."backup_captures" USING btree ("state","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_backup_capture_destination" ON "recreio"."backup_captures" USING btree ("bucket_id","state");--> statement-breakpoint
CREATE INDEX "recreio_backup_object_hold_active" ON "recreio"."backup_object_holds" USING btree ("delivery_id","capture_id") WHERE "recreio"."backup_object_holds"."released_at" is null;