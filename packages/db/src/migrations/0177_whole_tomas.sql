CREATE TABLE "recreio"."session_save_permits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"renewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"reason" text,
	"request_hash" text,
	"results" jsonb,
	"checkpoint_space_id" uuid,
	"checkpoint_fence" integer,
	"checkpoint_revision" integer,
	"checkpoint_journal_seq" integer,
	CONSTRAINT "recreio_save_policy" CHECK ("recreio"."session_save_permits"."policy_version" between 1 and 2147483646),
	CONSTRAINT "recreio_save_mode" CHECK ("recreio"."session_save_permits"."mode" in ('profile','server')),
	CONSTRAINT "recreio_save_status" CHECK ("recreio"."session_save_permits"."status" in ('ready','completed','conflicted','expired')),
	CONSTRAINT "recreio_save_reason" CHECK ("recreio"."session_save_permits"."reason" is null or "recreio"."session_save_permits"."reason" in ('time','access','manual')),
	CONSTRAINT "recreio_save_deadline" CHECK ("recreio"."session_save_permits"."renewed_at">="recreio"."session_save_permits"."created_at" and "recreio"."session_save_permits"."cutoff_at">"recreio"."session_save_permits"."renewed_at"
    and "recreio"."session_save_permits"."expires_at"="recreio"."session_save_permits"."cutoff_at"+interval '30 seconds'
    and "recreio"."session_save_permits"."expires_at"<="recreio"."session_save_permits"."renewed_at"+interval '15 minutes 30 seconds'),
	CONSTRAINT "recreio_save_hash" CHECK ("recreio"."session_save_permits"."request_hash" is null or "recreio"."session_save_permits"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "recreio_save_results" CHECK ("recreio"."session_save_permits"."results" is null or (jsonb_typeof("recreio"."session_save_permits"."results")='array' and jsonb_array_length("recreio"."session_save_permits"."results")<=16)),
	CONSTRAINT "recreio_save_lifecycle" CHECK (
    ("recreio"."session_save_permits"."status"='ready' and "recreio"."session_save_permits"."finished_at" is null and "recreio"."session_save_permits"."reason" is null and "recreio"."session_save_permits"."request_hash" is null)
    or ("recreio"."session_save_permits"."status"='expired' and "recreio"."session_save_permits"."finished_at" is not null and "recreio"."session_save_permits"."finished_at">="recreio"."session_save_permits"."expires_at" and "recreio"."session_save_permits"."reason" is null and "recreio"."session_save_permits"."request_hash" is null)
    or ("recreio"."session_save_permits"."status" in ('completed','conflicted') and "recreio"."session_save_permits"."finished_at" is not null and "recreio"."session_save_permits"."finished_at">="recreio"."session_save_permits"."created_at" and "recreio"."session_save_permits"."finished_at"<"recreio"."session_save_permits"."expires_at"
      and "recreio"."session_save_permits"."reason" is not null and "recreio"."session_save_permits"."request_hash" is not null)),
	CONSTRAINT "recreio_save_proof" CHECK (
    ("recreio"."session_save_permits"."mode"='profile' and "recreio"."session_save_permits"."checkpoint_space_id" is null and "recreio"."session_save_permits"."checkpoint_fence" is null and "recreio"."session_save_permits"."checkpoint_revision" is null and "recreio"."session_save_permits"."checkpoint_journal_seq" is null
      and (("recreio"."session_save_permits"."status" in ('ready','expired') and "recreio"."session_save_permits"."results" is null) or ("recreio"."session_save_permits"."status" in ('completed','conflicted') and "recreio"."session_save_permits"."results" is not null)))
    or ("recreio"."session_save_permits"."mode"='server' and "recreio"."session_save_permits"."results" is null and "recreio"."session_save_permits"."status"<>'conflicted' and (
      ("recreio"."session_save_permits"."status" in ('ready','expired') and "recreio"."session_save_permits"."checkpoint_space_id" is null and "recreio"."session_save_permits"."checkpoint_fence" is null and "recreio"."session_save_permits"."checkpoint_revision" is null and "recreio"."session_save_permits"."checkpoint_journal_seq" is null)
      or ("recreio"."session_save_permits"."status"='completed' and "recreio"."session_save_permits"."checkpoint_space_id" is not null and "recreio"."session_save_permits"."checkpoint_fence" is not null and "recreio"."session_save_permits"."checkpoint_fence">=1
        and "recreio"."session_save_permits"."checkpoint_revision" is not null and "recreio"."session_save_permits"."checkpoint_revision">=0 and "recreio"."session_save_permits"."checkpoint_journal_seq" is not null and "recreio"."session_save_permits"."checkpoint_journal_seq">=0)
    )))
);
--> statement-breakpoint
ALTER TABLE "recreio"."session_save_permits" ADD CONSTRAINT "session_save_permits_checkpoint_space_id_spaces_id_fk" FOREIGN KEY ("checkpoint_space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."session_save_permits" ADD CONSTRAINT "recreio_save_session_profile" FOREIGN KEY ("session_id","profile_id") REFERENCES "recreio"."game_sessions"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_save_session" ON "recreio"."session_save_permits" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "recreio_save_retention" ON "recreio"."session_save_permits" USING btree ("expires_at","id");