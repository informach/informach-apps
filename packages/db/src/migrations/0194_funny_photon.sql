CREATE TABLE "recreio"."directed_invite_guardian_approvals" (
	"invite_id" uuid NOT NULL,
	"origin_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"guardian_link_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"access_generation" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directed_invite_guardian_approvals_invite_id_profile_id_pk" PRIMARY KEY("invite_id","profile_id"),
	CONSTRAINT "recreio_directed_guardian_approval_participant" CHECK ("recreio"."directed_invite_guardian_approvals"."profile_id" in ("recreio"."directed_invite_guardian_approvals"."origin_profile_id","recreio"."directed_invite_guardian_approvals"."target_profile_id")),
	CONSTRAINT "recreio_directed_guardian_approval_policy" CHECK ("recreio"."directed_invite_guardian_approvals"."policy_version">0)
);
--> statement-breakpoint
CREATE TABLE "recreio"."directed_invite_world_approvals" (
	"invite_id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"approved_by_member_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"actor_kind" text NOT NULL,
	"management_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_directed_world_approval_actor" CHECK ("recreio"."directed_invite_world_approvals"."actor_kind" in ('jogador','responsavel')),
	CONSTRAINT "recreio_directed_world_approval_revision" CHECK ("recreio"."directed_invite_world_approvals"."management_revision" between 1 and 2147483646)
);
--> statement-breakpoint
CREATE TABLE "recreio"."directed_space_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"invited_by_member_id" uuid NOT NULL,
	"origin_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"participation" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"management_revision" integer NOT NULL,
	"friendship_revision" integer NOT NULL,
	"origin_policy_version" integer NOT NULL,
	"target_policy_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"retain_until" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_directed_invite_participants" UNIQUE("id","origin_profile_id","target_profile_id"),
	CONSTRAINT "recreio_directed_invite_world" UNIQUE("id","space_id"),
	CONSTRAINT "recreio_directed_invite_distinct" CHECK ("recreio"."directed_space_invites"."origin_profile_id"<>"recreio"."directed_space_invites"."target_profile_id"),
	CONSTRAINT "recreio_directed_invite_digest" CHECK ("recreio"."directed_space_invites"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_directed_invite_versions" CHECK ("recreio"."directed_space_invites"."management_revision" between 1 and 2147483646 and "recreio"."directed_space_invites"."friendship_revision" between 1 and 2147483646 and "recreio"."directed_space_invites"."origin_policy_version">0 and "recreio"."directed_space_invites"."target_policy_version">0),
	CONSTRAINT "recreio_directed_invite_participation" CHECK ("recreio"."directed_space_invites"."participation" is null or char_length("recreio"."directed_space_invites"."participation")<=64),
	CONSTRAINT "recreio_directed_invite_state" CHECK ("recreio"."directed_space_invites"."state" in ('pending','accepted','declined','revoked','expired')),
	CONSTRAINT "recreio_directed_invite_expiry" CHECK ("recreio"."directed_space_invites"."expires_at">"recreio"."directed_space_invites"."created_at" and "recreio"."directed_space_invites"."expires_at"<="recreio"."directed_space_invites"."created_at"+interval '24 hours' and "recreio"."directed_space_invites"."retain_until"="recreio"."directed_space_invites"."created_at"+interval '30 days'),
	CONSTRAINT "recreio_directed_invite_lifecycle" CHECK (("recreio"."directed_space_invites"."state"='pending' and "recreio"."directed_space_invites"."finished_at" is null) or ("recreio"."directed_space_invites"."state"<>'pending' and "recreio"."directed_space_invites"."finished_at" is not null and "recreio"."directed_space_invites"."finished_at">="recreio"."directed_space_invites"."created_at" and ("recreio"."directed_space_invites"."state"<>'accepted' or "recreio"."directed_space_invites"."finished_at"<"recreio"."directed_space_invites"."expires_at") and ("recreio"."directed_space_invites"."state"<>'expired' or "recreio"."directed_space_invites"."finished_at">="recreio"."directed_space_invites"."expires_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."directed_invite_guardian_approvals" ADD CONSTRAINT "directed_invite_guardian_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_invite_guardian_approvals" ADD CONSTRAINT "recreio_directed_guardian_approval_participants" FOREIGN KEY ("invite_id","origin_profile_id","target_profile_id") REFERENCES "recreio"."directed_space_invites"("id","origin_profile_id","target_profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_invite_guardian_approvals" ADD CONSTRAINT "recreio_directed_guardian_approval_profile" FOREIGN KEY ("guardian_link_id","profile_id") REFERENCES "recreio"."guardian_links"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_invite_world_approvals" ADD CONSTRAINT "directed_invite_world_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_invite_world_approvals" ADD CONSTRAINT "recreio_directed_world_approval_invite" FOREIGN KEY ("invite_id","space_id") REFERENCES "recreio"."directed_space_invites"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_invite_world_approvals" ADD CONSTRAINT "recreio_directed_world_approval_member" FOREIGN KEY ("space_id","approved_by_member_id") REFERENCES "recreio"."space_members"("space_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_space_invites" ADD CONSTRAINT "directed_space_invites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_space_invites" ADD CONSTRAINT "directed_space_invites_origin_profile_id_profiles_id_fk" FOREIGN KEY ("origin_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_space_invites" ADD CONSTRAINT "directed_space_invites_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."directed_space_invites" ADD CONSTRAINT "recreio_directed_invite_emitter" FOREIGN KEY ("space_id","invited_by_member_id","origin_profile_id") REFERENCES "recreio"."space_members"("space_id","id","profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_directed_invite_retry" ON "recreio"."directed_space_invites" USING btree ("origin_profile_id","client_key");--> statement-breakpoint
CREATE INDEX "recreio_directed_invite_incoming" ON "recreio"."directed_space_invites" USING btree ("target_profile_id","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_directed_invite_world_pending" ON "recreio"."directed_space_invites" USING btree ("space_id","id") WHERE "recreio"."directed_space_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_directed_invite_expiry" ON "recreio"."directed_space_invites" USING btree ("expires_at","id") WHERE "recreio"."directed_space_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_directed_invite_retention" ON "recreio"."directed_space_invites" USING btree ("retain_until","id");