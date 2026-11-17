CREATE TABLE "recreio"."session_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"from_session_id" uuid NOT NULL,
	"to_device_session_id" uuid NOT NULL,
	"ticket_jti" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"checkpoint_space_id" uuid,
	"checkpoint_fence" integer,
	"checkpoint_revision" integer,
	"checkpoint_journal_seq" integer,
	CONSTRAINT "recreio_handoff_status" CHECK ("recreio"."session_handoffs"."status" in ('requested','confirmed','completed','failed','canceled','expired')),
	CONSTRAINT "recreio_handoff_policy" CHECK ("recreio"."session_handoffs"."policy_version" between 1 and 2147483646),
	CONSTRAINT "recreio_handoff_deadline" CHECK ("recreio"."session_handoffs"."expires_at">"recreio"."session_handoffs"."requested_at" and "recreio"."session_handoffs"."expires_at"<="recreio"."session_handoffs"."requested_at"+interval '60 seconds'),
	CONSTRAINT "recreio_handoff_lifecycle" CHECK (
    ("recreio"."session_handoffs"."status"='requested' and "recreio"."session_handoffs"."confirmed_at" is null and "recreio"."session_handoffs"."finished_at" is null)
    or ("recreio"."session_handoffs"."status"='confirmed' and "recreio"."session_handoffs"."confirmed_at" is not null and "recreio"."session_handoffs"."finished_at" is null)
    or ("recreio"."session_handoffs"."status"='completed' and "recreio"."session_handoffs"."confirmed_at" is not null and "recreio"."session_handoffs"."finished_at" is not null)
    or ("recreio"."session_handoffs"."status" in ('failed','canceled','expired') and "recreio"."session_handoffs"."finished_at" is not null)
  ),
	CONSTRAINT "recreio_handoff_confirmation_time" CHECK ("recreio"."session_handoffs"."confirmed_at" is null or ("recreio"."session_handoffs"."confirmed_at">="recreio"."session_handoffs"."requested_at" and "recreio"."session_handoffs"."confirmed_at"<"recreio"."session_handoffs"."expires_at")),
	CONSTRAINT "recreio_handoff_finished_time" CHECK ("recreio"."session_handoffs"."finished_at" is null or "recreio"."session_handoffs"."finished_at">="recreio"."session_handoffs"."requested_at"),
	CONSTRAINT "recreio_handoff_proof" CHECK (
    ("recreio"."session_handoffs"."mode"='profile' and "recreio"."session_handoffs"."checkpoint_space_id" is null and "recreio"."session_handoffs"."checkpoint_fence" is null and "recreio"."session_handoffs"."checkpoint_revision" is null and "recreio"."session_handoffs"."checkpoint_journal_seq" is null)
    or ("recreio"."session_handoffs"."mode"='server' and (
      ("recreio"."session_handoffs"."confirmed_at" is null and "recreio"."session_handoffs"."checkpoint_space_id" is null and "recreio"."session_handoffs"."checkpoint_fence" is null and "recreio"."session_handoffs"."checkpoint_revision" is null and "recreio"."session_handoffs"."checkpoint_journal_seq" is null)
      or ("recreio"."session_handoffs"."confirmed_at" is not null and "recreio"."session_handoffs"."checkpoint_space_id" is not null and "recreio"."session_handoffs"."checkpoint_fence" is not null and "recreio"."session_handoffs"."checkpoint_fence">=1 and "recreio"."session_handoffs"."checkpoint_revision" is not null and "recreio"."session_handoffs"."checkpoint_revision">=0 and "recreio"."session_handoffs"."checkpoint_journal_seq" is not null and "recreio"."session_handoffs"."checkpoint_journal_seq">=0)
    ))
  )
);
--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" ADD COLUMN "checkpoint_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" ADD COLUMN "control_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recreio"."session_handoffs" ADD CONSTRAINT "session_handoffs_to_device_session_id_device_sessions_id_fk" FOREIGN KEY ("to_device_session_id") REFERENCES "recreio"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."session_handoffs" ADD CONSTRAINT "session_handoffs_ticket_jti_game_tickets_jti_fk" FOREIGN KEY ("ticket_jti") REFERENCES "recreio"."game_tickets"("jti") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."session_handoffs" ADD CONSTRAINT "recreio_handoff_session_profile" FOREIGN KEY ("from_session_id","profile_id") REFERENCES "recreio"."game_sessions"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_handoff_ticket" ON "recreio"."session_handoffs" USING btree ("ticket_jti");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_handoff_pending_session" ON "recreio"."session_handoffs" USING btree ("from_session_id") WHERE "recreio"."session_handoffs"."status" in ('requested','confirmed');--> statement-breakpoint
CREATE INDEX "recreio_handoff_retention" ON "recreio"."session_handoffs" USING btree ("expires_at","id");