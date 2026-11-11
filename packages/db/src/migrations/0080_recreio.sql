CREATE SCHEMA "recreio";
--> statement-breakpoint
CREATE SEQUENCE "recreio"."game_session_end_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "recreio"."device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"auth_session_id" text,
	"user_id" text,
	"active_profile_id" uuid,
	"profile_selected_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_device_sessions_kind" CHECK ("recreio"."device_sessions"."kind" in ('account', 'paired_device')),
	CONSTRAINT "recreio_device_sessions_account" CHECK ("recreio"."device_sessions"."kind" <> 'account' or ("recreio"."device_sessions"."auth_session_id" is not null and "recreio"."device_sessions"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "recreio"."entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"tier" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason_code" text NOT NULL,
	"granted_by_user_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"revoke_reason_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_entitlements_kind" CHECK ("recreio"."entitlements"."kind" in ('courtesy', 'trial')),
	CONSTRAINT "recreio_entitlements_tier" CHECK ("recreio"."entitlements"."tier" in ('individual', 'family')),
	CONSTRAINT "recreio_entitlements_period" CHECK ("recreio"."entitlements"."ends_at" > "recreio"."entitlements"."starts_at"),
	CONSTRAINT "recreio_entitlements_reason" CHECK ("recreio"."entitlements"."reason_code" ~ '^[a-z0-9_]{2,40}$'),
	CONSTRAINT "recreio_entitlements_revoke_reason" CHECK ("recreio"."entitlements"."revoke_reason_code" is null or ("recreio"."entitlements"."revoked_at" is not null and "recreio"."entitlements"."revoke_reason_code" ~ '^[a-z0-9_]{2,40}$'))
);
--> statement-breakpoint
CREATE TABLE "recreio"."game_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"public_url" text NOT NULL,
	"version" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"capacity" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_game_instances_state" CHECK ("recreio"."game_instances"."state" in ('active', 'draining', 'gone')),
	CONSTRAINT "recreio_game_instances_capacity" CHECK ("recreio"."game_instances"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recreio"."game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"device_session_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"space_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_renewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"ended_seq" bigint,
	CONSTRAINT "recreio_game_sessions_end_reason" CHECK ("recreio"."game_sessions"."end_reason" is null or "recreio"."game_sessions"."end_reason" in ('left', 'replaced', 'access_lost', 'signed_out', 'expired')),
	CONSTRAINT "recreio_game_sessions_ended" CHECK (("recreio"."game_sessions"."ended_at" is null and "recreio"."game_sessions"."end_reason" is null and "recreio"."game_sessions"."ended_seq" is null) or ("recreio"."game_sessions"."ended_at" is not null and "recreio"."game_sessions"."end_reason" is not null and "recreio"."game_sessions"."ended_seq" is not null))
);
--> statement-breakpoint
CREATE TABLE "recreio"."game_tickets" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"device_session_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recreio"."groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recreio"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"group_id" uuid,
	"coverage_enabled" boolean DEFAULT true NOT NULL,
	"kind" text NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text DEFAULT 'padrao' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_profiles_kind" CHECK ("recreio"."profiles"."kind" in ('adult', 'minor')),
	CONSTRAINT "recreio_profiles_adult_login" CHECK ("recreio"."profiles"."kind" = 'minor' or "recreio"."profiles"."user_id" is not null),
	CONSTRAINT "recreio_profiles_nickname" CHECK (char_length("recreio"."profiles"."nickname") between 2 and 20),
	CONSTRAINT "recreio_profiles_status" CHECK ("recreio"."profiles"."status" in ('active', 'suspended')),
	CONSTRAINT "recreio_profiles_policy_version" CHECK ("recreio"."profiles"."policy_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "recreio"."space_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"invited_by_member_id" uuid NOT NULL,
	"form" text NOT NULL,
	"participation" text,
	"code_hash" text NOT NULL,
	"target_profile_id" uuid,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_space_invites_form" CHECK ("recreio"."space_invites"."form" in ('member', 'visit')),
	CONSTRAINT "recreio_space_invites_state" CHECK ("recreio"."space_invites"."state" in ('pending_approval', 'sent', 'accepted', 'expired', 'revoked')),
	CONSTRAINT "recreio_space_invites_participation" CHECK ("recreio"."space_invites"."participation" is null or char_length("recreio"."space_invites"."participation") <= 64)
);
--> statement-breakpoint
CREATE TABLE "recreio"."space_journal" (
	"space_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"fence" integer NOT NULL,
	"tick" bigint NOT NULL,
	"fact_id" text NOT NULL,
	"payload" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_journal_space_id_seq_pk" PRIMARY KEY("space_id","seq"),
	CONSTRAINT "recreio_space_journal_counters" CHECK ("recreio"."space_journal"."seq" >= 1 and "recreio"."space_journal"."fence" >= 0 and "recreio"."space_journal"."tick" >= 0 and "recreio"."space_journal"."byte_size" >= 0),
	CONSTRAINT "recreio_space_journal_fact_id" CHECK (char_length("recreio"."space_journal"."fact_id") between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "recreio"."space_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"fence" integer NOT NULL,
	"holder_kind" text NOT NULL,
	"instance_id" uuid,
	"state" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"end_reason" text,
	"peak_players" integer DEFAULT 0 NOT NULL,
	"player_seconds" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "recreio_space_leases_holder_kind" CHECK ("recreio"."space_leases"."holder_kind" in ('server', 'offline', 'browser')),
	CONSTRAINT "recreio_space_leases_state" CHECK ("recreio"."space_leases"."state" in ('assigned', 'held', 'released')),
	CONSTRAINT "recreio_space_leases_end_reason" CHECK ("recreio"."space_leases"."end_reason" is null or "recreio"."space_leases"."end_reason" in ('empty', 'drain', 'error', 'expired', 'taken_over')),
	CONSTRAINT "recreio_space_leases_released" CHECK (("recreio"."space_leases"."state" = 'released') = ("recreio"."space_leases"."released_at" is not null)),
	CONSTRAINT "recreio_space_leases_counters" CHECK ("recreio"."space_leases"."fence" >= 0 and "recreio"."space_leases"."peak_players" >= 0 and "recreio"."space_leases"."player_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recreio"."space_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"profile_id" uuid,
	"role" text NOT NULL,
	"state" text NOT NULL,
	"participation" text,
	"invited_by_member_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "recreio_space_members_role" CHECK ("recreio"."space_members"."role" in ('steward', 'coadmin', 'member')),
	CONSTRAINT "recreio_space_members_state" CHECK ("recreio"."space_members"."state" in ('active', 'no_access', 'away', 'former')),
	CONSTRAINT "recreio_space_members_participation" CHECK ("recreio"."space_members"."participation" is null or char_length("recreio"."space_members"."participation") <= 64)
);
--> statement-breakpoint
CREATE TABLE "recreio"."space_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"fence" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"journal_seq" bigint NOT NULL,
	"tick" bigint NOT NULL,
	"kind" text NOT NULL,
	"storage" text NOT NULL,
	"data" "bytea",
	"object_key" text,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_space_snapshots_kind" CHECK ("recreio"."space_snapshots"."kind" in ('checkpoint', 'hibernate', 'pinned')),
	CONSTRAINT "recreio_space_snapshots_storage" CHECK (("recreio"."space_snapshots"."storage" = 'pg' and "recreio"."space_snapshots"."data" is not null and "recreio"."space_snapshots"."object_key" is null) or ("recreio"."space_snapshots"."storage" = 'bucket' and "recreio"."space_snapshots"."object_key" is not null and "recreio"."space_snapshots"."data" is null)),
	CONSTRAINT "recreio_space_snapshots_sha256" CHECK ("recreio"."space_snapshots"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "recreio_space_snapshots_counters" CHECK ("recreio"."space_snapshots"."revision" >= 0 and "recreio"."space_snapshots"."fence" >= 0 and "recreio"."space_snapshots"."journal_seq" >= 0 and "recreio"."space_snapshots"."tick" >= 0 and "recreio"."space_snapshots"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recreio"."spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" text NOT NULL,
	"steward_profile_id" uuid,
	"created_by_profile_id" uuid,
	"name" text NOT NULL,
	"content_policy" text NOT NULL,
	"members_invite" text DEFAULT 'with_approval' NOT NULL,
	"status" text DEFAULT 'hibernating' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"journal_seq" bigint DEFAULT 0 NOT NULL,
	"lease_epoch" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_spaces_name" CHECK (char_length("recreio"."spaces"."name") between 2 and 40),
	CONSTRAINT "recreio_spaces_members_invite" CHECK ("recreio"."spaces"."members_invite" in ('no', 'with_approval', 'yes')),
	CONSTRAINT "recreio_spaces_status" CHECK ("recreio"."spaces"."status" in ('active', 'hibernating', 'archived', 'deleted')),
	CONSTRAINT "recreio_spaces_counters" CHECK ("recreio"."spaces"."schema_version" >= 1 and "recreio"."spaces"."revision" >= 0 and "recreio"."spaces"."journal_seq" >= 0 and "recreio"."spaces"."lease_epoch" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recreio"."device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."device_sessions" ADD CONSTRAINT "device_sessions_active_profile_id_profiles_id_fk" FOREIGN KEY ("active_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."entitlements" ADD CONSTRAINT "entitlements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "recreio"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."entitlements" ADD CONSTRAINT "entitlements_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."entitlements" ADD CONSTRAINT "entitlements_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" ADD CONSTRAINT "game_sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" ADD CONSTRAINT "game_sessions_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "recreio"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" ADD CONSTRAINT "game_sessions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."game_tickets" ADD CONSTRAINT "game_tickets_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."game_tickets" ADD CONSTRAINT "game_tickets_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "recreio"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."groups" ADD CONSTRAINT "groups_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profiles" ADD CONSTRAINT "profiles_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "recreio"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_invites" ADD CONSTRAINT "space_invites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_invites" ADD CONSTRAINT "space_invites_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_invites" ADD CONSTRAINT "space_invites_accepted_by_profile_id_profiles_id_fk" FOREIGN KEY ("accepted_by_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_journal" ADD CONSTRAINT "space_journal_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_leases" ADD CONSTRAINT "space_leases_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_leases" ADD CONSTRAINT "space_leases_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "recreio"."game_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_members" ADD CONSTRAINT "space_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_snapshots" ADD CONSTRAINT "space_snapshots_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD CONSTRAINT "spaces_steward_profile_id_profiles_id_fk" FOREIGN KEY ("steward_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."spaces" ADD CONSTRAINT "spaces_created_by_profile_id_profiles_id_fk" FOREIGN KEY ("created_by_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_device_sessions_auth_session" ON "recreio"."device_sessions" USING btree ("auth_session_id") WHERE "recreio"."device_sessions"."auth_session_id" is not null;--> statement-breakpoint
CREATE INDEX "recreio_device_sessions_user" ON "recreio"."device_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recreio_entitlements_group" ON "recreio"."entitlements" USING btree ("group_id","ends_at");--> statement-breakpoint
CREATE INDEX "recreio_game_instances_pick" ON "recreio"."game_instances" USING btree ("game_id","state","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_game_sessions_one_open" ON "recreio"."game_sessions" USING btree ("profile_id") WHERE "recreio"."game_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_game_sessions_ended_seq" ON "recreio"."game_sessions" USING btree ("ended_seq") WHERE "recreio"."game_sessions"."ended_seq" is not null;--> statement-breakpoint
CREATE INDEX "recreio_game_tickets_expires" ON "recreio"."game_tickets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_groups_owner" ON "recreio"."groups" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_profiles_own_login" ON "recreio"."profiles" USING btree ("user_id") WHERE "recreio"."profiles"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "recreio_profiles_group" ON "recreio"."profiles" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_space_invites_code" ON "recreio"."space_invites" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "recreio_space_invites_space" ON "recreio"."space_invites" USING btree ("space_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_space_journal_fact" ON "recreio"."space_journal" USING btree ("space_id","fact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_space_leases_fence" ON "recreio"."space_leases" USING btree ("space_id","fence");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_space_leases_one_open" ON "recreio"."space_leases" USING btree ("space_id") WHERE "recreio"."space_leases"."released_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_space_leases_expiring" ON "recreio"."space_leases" USING btree ("expires_at") WHERE "recreio"."space_leases"."released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_space_members_profile" ON "recreio"."space_members" USING btree ("space_id","profile_id");--> statement-breakpoint
CREATE INDEX "recreio_space_members_by_profile" ON "recreio"."space_members" USING btree ("profile_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_space_snapshots_revision" ON "recreio"."space_snapshots" USING btree ("space_id","revision");--> statement-breakpoint
CREATE INDEX "recreio_spaces_steward" ON "recreio"."spaces" USING btree ("steward_profile_id");--> statement-breakpoint
CREATE INDEX "recreio_spaces_creator" ON "recreio"."spaces" USING btree ("created_by_profile_id");