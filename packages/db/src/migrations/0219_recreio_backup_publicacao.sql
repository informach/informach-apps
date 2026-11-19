CREATE TABLE "recreio"."backup_publications" (
	"capture_id" uuid PRIMARY KEY NOT NULL,
	"storage_scope" text NOT NULL,
	"bucket_id" uuid NOT NULL,
	"bucket_name" text NOT NULL,
	"source" text NOT NULL,
	"state" text NOT NULL,
	"attempt" uuid NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_verified_at" timestamp with time zone,
	"index_body" text,
	"index_sha256" text,
	"index_prepared_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	CONSTRAINT "recreio_backup_publication_target" CHECK (
      "recreio"."backup_publications"."storage_scope" in ('qualification','production') and
      "recreio"."backup_publications"."bucket_name" ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' and "recreio"."backup_publications"."source" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "recreio_backup_publication_index" CHECK (
      ("recreio"."backup_publications"."index_body" is null and "recreio"."backup_publications"."index_sha256" is null and "recreio"."backup_publications"."index_prepared_at" is null) or
      ("recreio"."backup_publications"."index_body" is not null and octet_length("recreio"."backup_publications"."index_body") between 1 and 32768 and
       "recreio"."backup_publications"."index_sha256" is not null and "recreio"."backup_publications"."index_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."backup_publications"."index_prepared_at" is not null)),
	CONSTRAINT "recreio_backup_publication_lifecycle" CHECK (
      ("recreio"."backup_publications"."state"='prepared' and "recreio"."backup_publications"."file_verified_at" is null and "recreio"."backup_publications"."index_prepared_at" is null and "recreio"."backup_publications"."published_at" is null) or
      ("recreio"."backup_publications"."state"='file_verified' and "recreio"."backup_publications"."file_verified_at" is not null and "recreio"."backup_publications"."index_prepared_at" is null and "recreio"."backup_publications"."published_at" is null) or
      ("recreio"."backup_publications"."state"='index_prepared' and "recreio"."backup_publications"."file_verified_at" is not null and "recreio"."backup_publications"."index_prepared_at" is not null and "recreio"."backup_publications"."published_at" is null) or
      ("recreio"."backup_publications"."state"='published' and "recreio"."backup_publications"."file_verified_at" is not null and "recreio"."backup_publications"."index_prepared_at" is not null and "recreio"."backup_publications"."published_at" is not null)),
	CONSTRAINT "recreio_backup_publication_times" CHECK (
      isfinite("recreio"."backup_publications"."created_at") and isfinite("recreio"."backup_publications"."lease_until") and "recreio"."backup_publications"."lease_until">"recreio"."backup_publications"."created_at" and
      ("recreio"."backup_publications"."file_verified_at" is null or (isfinite("recreio"."backup_publications"."file_verified_at") and "recreio"."backup_publications"."file_verified_at">="recreio"."backup_publications"."created_at")) and
      ("recreio"."backup_publications"."index_prepared_at" is null or (isfinite("recreio"."backup_publications"."index_prepared_at") and "recreio"."backup_publications"."index_prepared_at">="recreio"."backup_publications"."file_verified_at")) and
      ("recreio"."backup_publications"."published_at" is null or (isfinite("recreio"."backup_publications"."published_at") and "recreio"."backup_publications"."published_at">="recreio"."backup_publications"."index_prepared_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."backup_publications" ADD CONSTRAINT "backup_publications_capture_id_backup_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "recreio"."backup_captures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_backup_publication_pending" ON "recreio"."backup_publications" USING btree ("state","lease_until","capture_id");