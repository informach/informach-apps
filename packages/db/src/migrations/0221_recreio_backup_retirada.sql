CREATE TABLE "recreio"."backup_retirements" (
	"capture_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"reason" text NOT NULL,
	"state" text NOT NULL,
	"marker_body" text NOT NULL,
	"marker_sha256" text NOT NULL,
	"attempt" uuid NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marker_stored_at" timestamp with time zone,
	"first_absence_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_backup_retirement_metadata" CHECK ("recreio"."backup_retirements"."source" ~ '^[a-f0-9]{40}$' and
    "recreio"."backup_retirements"."reason" in ('abandonado','retencao','privacidade') and octet_length("recreio"."backup_retirements"."marker_body") between 1 and 32768
    and "recreio"."backup_retirements"."marker_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_backup_retirement_lifecycle" CHECK (
    ("recreio"."backup_retirements"."state"='prepared' and "recreio"."backup_retirements"."marker_stored_at" is null and "recreio"."backup_retirements"."first_absence_at" is null and "recreio"."backup_retirements"."last_checked_at" is null) or
    ("recreio"."backup_retirements"."state"='marked' and "recreio"."backup_retirements"."marker_stored_at" is not null and "recreio"."backup_retirements"."first_absence_at" is null and "recreio"."backup_retirements"."last_checked_at" is null) or
    ("recreio"."backup_retirements"."state"='absent' and "recreio"."backup_retirements"."marker_stored_at" is not null and "recreio"."backup_retirements"."first_absence_at" is not null and "recreio"."backup_retirements"."last_checked_at" is not null)),
	CONSTRAINT "recreio_backup_retirement_times" CHECK (isfinite("recreio"."backup_retirements"."created_at") and isfinite("recreio"."backup_retirements"."lease_until") and
    "recreio"."backup_retirements"."lease_until">"recreio"."backup_retirements"."created_at" and isfinite("recreio"."backup_retirements"."next_attempt_at") and
    ("recreio"."backup_retirements"."marker_stored_at" is null or (isfinite("recreio"."backup_retirements"."marker_stored_at") and "recreio"."backup_retirements"."marker_stored_at">="recreio"."backup_retirements"."created_at")) and
    ("recreio"."backup_retirements"."first_absence_at" is null or (isfinite("recreio"."backup_retirements"."first_absence_at") and "recreio"."backup_retirements"."first_absence_at">="recreio"."backup_retirements"."marker_stored_at")) and
    ("recreio"."backup_retirements"."last_checked_at" is null or (isfinite("recreio"."backup_retirements"."last_checked_at") and "recreio"."backup_retirements"."last_checked_at">="recreio"."backup_retirements"."first_absence_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."backup_captures" ADD COLUMN "protocol_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recreio"."backup_retirements" ADD CONSTRAINT "backup_retirements_capture_id_backup_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "recreio"."backup_captures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_backup_retirement_due" ON "recreio"."backup_retirements" USING btree ("next_attempt_at","capture_id");--> statement-breakpoint
ALTER TABLE "recreio"."backup_captures" ADD CONSTRAINT "recreio_backup_capture_protocol" CHECK ("recreio"."backup_captures"."protocol_version" in (0,1));