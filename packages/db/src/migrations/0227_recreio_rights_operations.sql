CREATE TABLE "recreio"."rights_subjects" (
	"operation_id" uuid NOT NULL,
	"profile_reference" uuid NOT NULL,
	"live_profile_id" uuid,
	"policy_version" integer NOT NULL,
	"guardian_reference" uuid,
	"completed_at" timestamp with time zone,
	CONSTRAINT "recreio_rights_subject" PRIMARY KEY("operation_id","profile_reference"),
	CONSTRAINT "recreio_rights_subject_identity" CHECK ("recreio"."rights_subjects"."live_profile_id" is null or "recreio"."rights_subjects"."live_profile_id"="recreio"."rights_subjects"."profile_reference"),
	CONSTRAINT "recreio_rights_subject_policy" CHECK ("recreio"."rights_subjects"."policy_version">=1)
);
--> statement-breakpoint
CREATE TABLE "recreio"."rights_worlds" (
	"operation_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"source_status" text NOT NULL,
	"source_revision" integer NOT NULL,
	"source_journal_seq" bigint NOT NULL,
	"source_lease_epoch" integer NOT NULL,
	"source_management_revision" integer NOT NULL,
	"snapshot_cursor" integer DEFAULT 0 NOT NULL,
	"phase" text DEFAULT 'frozen' NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "recreio_rights_world" PRIMARY KEY("operation_id","space_id"),
	CONSTRAINT "recreio_rights_world_status" CHECK ("recreio"."rights_worlds"."source_status" in ('hibernating','archived','deleted')),
	CONSTRAINT "recreio_rights_world_counters" CHECK ("recreio"."rights_worlds"."source_revision">=0 and "recreio"."rights_worlds"."source_journal_seq">=0 and "recreio"."rights_worlds"."source_lease_epoch">=0 and "recreio"."rights_worlds"."source_management_revision">=1 and "recreio"."rights_worlds"."snapshot_cursor">=0),
	CONSTRAINT "recreio_rights_world_phase" CHECK ("recreio"."rights_worlds"."phase" in ('frozen','snapshots','dependencies','completed')),
	CONSTRAINT "recreio_rights_world_completion" CHECK (("recreio"."rights_worlds"."phase"='completed' and "recreio"."rights_worlds"."completed_at" is not null) or ("recreio"."rights_worlds"."phase"<>'completed' and "recreio"."rights_worlds"."completed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "recreio"."rights_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"preparation_id" uuid NOT NULL,
	"requester_user_id" text NOT NULL,
	"plan_sha256" text NOT NULL,
	"kind" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"ledger_id" uuid NOT NULL,
	"ledger_epoch" integer NOT NULL,
	"signing_key_id" text NOT NULL,
	"source" text NOT NULL,
	"signed_intent" "bytea" NOT NULL,
	"intent_sha256" text NOT NULL,
	"authenticated_at" timestamp with time zone NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'publishing' NOT NULL,
	"admitted_head_sha256" text,
	"admitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"review_code" text,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_rights_operation_preparation" UNIQUE("preparation_id"),
	CONSTRAINT "recreio_rights_operation_kind" CHECK ("recreio"."rights_operations"."kind" in ('retirar_perfil','encerrar_conta')),
	CONSTRAINT "recreio_rights_operation_revision" CHECK ("recreio"."rights_operations"."revision"=1),
	CONSTRAINT "recreio_rights_operation_epoch" CHECK ("recreio"."rights_operations"."ledger_epoch" between 0 and 15),
	CONSTRAINT "recreio_rights_operation_key" CHECK ("recreio"."rights_operations"."signing_key_id" ~ '^[A-Za-z0-9._-]{1,64}$'),
	CONSTRAINT "recreio_rights_operation_source" CHECK ("recreio"."rights_operations"."source" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "recreio_rights_operation_intent" CHECK (octet_length("recreio"."rights_operations"."signed_intent") between 1 and 32768 and "recreio"."rights_operations"."intent_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_rights_operation_state" CHECK ("recreio"."rights_operations"."state" in ('publishing','admitted','running','completed','review')),
	CONSTRAINT "recreio_rights_operation_admission" CHECK (
      ("recreio"."rights_operations"."admitted_head_sha256" is null and "recreio"."rights_operations"."admitted_at" is null and "recreio"."rights_operations"."state" in ('publishing','review')) or
      ("recreio"."rights_operations"."admitted_head_sha256" is not null and "recreio"."rights_operations"."admitted_at" is not null and
       "recreio"."rights_operations"."admitted_head_sha256" ~ '^[a-f0-9]{64}$' and "recreio"."rights_operations"."admitted_at">="recreio"."rights_operations"."consented_at" and "recreio"."rights_operations"."state"<>'publishing')),
	CONSTRAINT "recreio_rights_operation_completion" CHECK (
      ("recreio"."rights_operations"."state"='completed' and "recreio"."rights_operations"."completed_at" is not null and "recreio"."rights_operations"."completed_at">="recreio"."rights_operations"."admitted_at" and "recreio"."rights_operations"."lease_token" is null) or
      ("recreio"."rights_operations"."state"<>'completed' and "recreio"."rights_operations"."completed_at" is null)),
	CONSTRAINT "recreio_rights_operation_review" CHECK (
      ("recreio"."rights_operations"."state"='review' and "recreio"."rights_operations"."review_code" is not null and "recreio"."rights_operations"."review_code" in ('ledger_unavailable','ledger_conflict','integrity','dependency','execution')) or
      ("recreio"."rights_operations"."state"<>'review' and "recreio"."rights_operations"."review_code" is null)),
	CONSTRAINT "recreio_rights_operation_lease" CHECK (
      ("recreio"."rights_operations"."lease_token" is null and "recreio"."rights_operations"."lease_until" is null) or
      ("recreio"."rights_operations"."lease_token" is not null and "recreio"."rights_operations"."lease_until" is not null and "recreio"."rights_operations"."lease_until">"recreio"."rights_operations"."updated_at" and "recreio"."rights_operations"."state"<>'completed')),
	CONSTRAINT "recreio_rights_operation_times" CHECK (
      "recreio"."rights_operations"."authenticated_at"<="recreio"."rights_operations"."consented_at" and "recreio"."rights_operations"."consented_at"<"recreio"."rights_operations"."authenticated_at"+interval '10 minutes' and
      "recreio"."rights_operations"."created_at"="recreio"."rights_operations"."consented_at" and "recreio"."rights_operations"."updated_at">="recreio"."rights_operations"."created_at" and "recreio"."rights_operations"."next_attempt_at">="recreio"."rights_operations"."created_at" and "recreio"."rights_operations"."attempts">=0)
);
--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD COLUMN "rights_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD COLUMN "rights_frozen_state" jsonb;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD COLUMN "rights_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD COLUMN "rights_frozen_state" jsonb;--> statement-breakpoint
ALTER TABLE "recreio"."rights_subjects" ADD CONSTRAINT "rights_subjects_operation_id_rights_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "recreio"."rights_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_subjects" ADD CONSTRAINT "rights_subjects_live_profile_id_profiles_id_fk" FOREIGN KEY ("live_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_worlds" ADD CONSTRAINT "rights_worlds_operation_id_rights_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "recreio"."rights_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_worlds" ADD CONSTRAINT "rights_worlds_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."rights_operations" ADD CONSTRAINT "recreio_rights_operation_preparation_identity" FOREIGN KEY ("preparation_id","requester_user_id","plan_sha256","kind") REFERENCES "recreio"."rights_preparations"("id","requester_user_id","plan_sha256","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_rights_subject_live" ON "recreio"."rights_subjects" USING btree ("live_profile_id");--> statement-breakpoint
CREATE INDEX "recreio_rights_world_space" ON "recreio"."rights_worlds" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "recreio_rights_operation_account" ON "recreio"."rights_operations" USING btree ("requester_user_id","consented_at","id");--> statement-breakpoint
CREATE INDEX "recreio_rights_operation_due" ON "recreio"."rights_operations" USING btree ("state","next_attempt_at","id");--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD CONSTRAINT "profiles_rights_operation_id_rights_operations_id_fk" FOREIGN KEY ("rights_operation_id") REFERENCES "recreio"."rights_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD CONSTRAINT "spaces_rights_operation_id_rights_operations_id_fk" FOREIGN KEY ("rights_operation_id") REFERENCES "recreio"."rights_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD CONSTRAINT "recreio_profiles_rights_freeze" CHECK (
      ("recreio"."profiles"."rights_operation_id" is null and "recreio"."profiles"."rights_frozen_state" is null) or
      ("recreio"."profiles"."rights_operation_id" is not null and "recreio"."profiles"."rights_frozen_state" is not null and
       "recreio"."profiles"."status"='suspended' and "recreio"."profiles"."rights_frozen_state"=jsonb_build_array("recreio"."profiles"."id", "recreio"."profiles"."user_id", "recreio"."profiles"."group_id", "recreio"."profiles"."coverage_enabled", "recreio"."profiles"."kind", "recreio"."profiles"."nickname", "recreio"."profiles"."avatar", "recreio"."profiles"."status", "recreio"."profiles"."policy_version", extract(epoch from "recreio"."profiles"."created_at"))));--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD CONSTRAINT "recreio_spaces_rights_freeze" CHECK (
      ("recreio"."spaces"."rights_operation_id" is null and "recreio"."spaces"."rights_frozen_state" is null) or
      ("recreio"."spaces"."rights_operation_id" is not null and "recreio"."spaces"."rights_frozen_state" is not null and
       "recreio"."spaces"."status"='archived' and "recreio"."spaces"."rights_frozen_state"=jsonb_build_array("recreio"."spaces"."id", "recreio"."spaces"."game_id", "recreio"."spaces"."steward_profile_id", "recreio"."spaces"."created_by_profile_id", "recreio"."spaces"."name", "recreio"."spaces"."content_policy", "recreio"."spaces"."members_invite", "recreio"."spaces"."status", "recreio"."spaces"."schema_version", "recreio"."spaces"."revision", "recreio"."spaces"."journal_seq", "recreio"."spaces"."lease_epoch", "recreio"."spaces"."management_revision", extract(epoch from "recreio"."spaces"."archived_at"), "recreio"."spaces"."summary", extract(epoch from "recreio"."spaces"."created_at"))));