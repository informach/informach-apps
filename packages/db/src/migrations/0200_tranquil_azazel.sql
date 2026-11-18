CREATE TABLE "recreio"."space_visit_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"host_presence_id" uuid NOT NULL,
	"host_session_id" uuid NOT NULL,
	"host_member_id" uuid NOT NULL,
	"origin_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"management_revision" integer NOT NULL,
	"friendship_revision" integer NOT NULL,
	"origin_policy_version" integer NOT NULL,
	"target_policy_version" integer NOT NULL,
	"origin_access_generation" uuid,
	"target_access_generation" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"retain_until" timestamp with time zone NOT NULL,
	CONSTRAINT "recreio_visit_invite_retry" UNIQUE("origin_profile_id","client_key"),
	CONSTRAINT "recreio_visit_invite_participants" UNIQUE("id","origin_profile_id","target_profile_id"),
	CONSTRAINT "recreio_visit_invite_world" UNIQUE("id","space_id"),
	CONSTRAINT "recreio_visit_invite_grant_identity" UNIQUE("id","space_id","target_profile_id","host_presence_id"),
	CONSTRAINT "recreio_visit_invite_distinct" CHECK ("recreio"."space_visit_invites"."origin_profile_id"<>"recreio"."space_visit_invites"."target_profile_id"),
	CONSTRAINT "recreio_visit_invite_digest" CHECK ("recreio"."space_visit_invites"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_visit_invite_versions" CHECK ("recreio"."space_visit_invites"."management_revision" between 1 and 2147483646 and "recreio"."space_visit_invites"."friendship_revision" between 1 and 2147483646 and "recreio"."space_visit_invites"."origin_policy_version">0 and "recreio"."space_visit_invites"."target_policy_version">0),
	CONSTRAINT "recreio_visit_invite_state" CHECK ("recreio"."space_visit_invites"."state" in ('pending','accepted','declined','revoked','expired')),
	CONSTRAINT "recreio_visit_invite_expiry" CHECK ("recreio"."space_visit_invites"."expires_at">"recreio"."space_visit_invites"."created_at" and "recreio"."space_visit_invites"."expires_at"<="recreio"."space_visit_invites"."created_at"+interval '24 hours' and "recreio"."space_visit_invites"."retain_until"="recreio"."space_visit_invites"."created_at"+interval '720 hours'),
	CONSTRAINT "recreio_visit_invite_lifecycle" CHECK (("recreio"."space_visit_invites"."state"='pending' and "recreio"."space_visit_invites"."finished_at" is null) or ("recreio"."space_visit_invites"."state"<>'pending' and "recreio"."space_visit_invites"."finished_at" is not null and "recreio"."space_visit_invites"."finished_at">="recreio"."space_visit_invites"."created_at" and ("recreio"."space_visit_invites"."state"<>'accepted' or "recreio"."space_visit_invites"."finished_at"<"recreio"."space_visit_invites"."expires_at") and ("recreio"."space_visit_invites"."state"<>'expired' or "recreio"."space_visit_invites"."finished_at">="recreio"."space_visit_invites"."expires_at")))
);
--> statement-breakpoint
CREATE TABLE "recreio"."visit_invite_guardian_approvals" (
	"invite_id" uuid NOT NULL,
	"origin_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"guardian_link_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"access_generation" uuid NOT NULL,
	"policy_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_visit_guardian_approval_pk" PRIMARY KEY("invite_id","profile_id"),
	CONSTRAINT "recreio_visit_guardian_participant" CHECK ("recreio"."visit_invite_guardian_approvals"."profile_id" in ("recreio"."visit_invite_guardian_approvals"."origin_profile_id","recreio"."visit_invite_guardian_approvals"."target_profile_id")),
	CONSTRAINT "recreio_visit_guardian_policy" CHECK ("recreio"."visit_invite_guardian_approvals"."policy_version">0)
);
--> statement-breakpoint
CREATE TABLE "recreio"."visit_invite_world_approvals" (
	"invite_id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"approved_by_member_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"actor_kind" text NOT NULL,
	"guardian_link_id" uuid,
	"access_generation" uuid,
	"policy_version" integer,
	"management_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_visit_world_approval_actor" CHECK (("recreio"."visit_invite_world_approvals"."actor_kind"='jogador' and "recreio"."visit_invite_world_approvals"."guardian_link_id" is null and "recreio"."visit_invite_world_approvals"."access_generation" is null and "recreio"."visit_invite_world_approvals"."policy_version" is null) or ("recreio"."visit_invite_world_approvals"."actor_kind"='responsavel' and "recreio"."visit_invite_world_approvals"."guardian_link_id" is not null and "recreio"."visit_invite_world_approvals"."access_generation" is not null and "recreio"."visit_invite_world_approvals"."policy_version" is not null and "recreio"."visit_invite_world_approvals"."policy_version">0)),
	CONSTRAINT "recreio_visit_world_approval_revision" CHECK ("recreio"."visit_invite_world_approvals"."management_revision" between 1 and 2147483646)
);
--> statement-breakpoint
CREATE TABLE "recreio"."world_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"visitor_profile_id" uuid NOT NULL,
	"host_presence_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "recreio_visit_grant_retry" UNIQUE("invite_id"),
	CONSTRAINT "recreio_visit_grant_identity" UNIQUE("id","space_id","visitor_profile_id"),
	CONSTRAINT "recreio_visit_grant_state" CHECK ("recreio"."world_visits"."state" in ('active','revoked','expired')),
	CONSTRAINT "recreio_visit_grant_window" CHECK ("recreio"."world_visits"."expires_at">"recreio"."world_visits"."accepted_at" and "recreio"."world_visits"."expires_at"<="recreio"."world_visits"."accepted_at"+interval '24 hours' and "recreio"."world_visits"."updated_at">="recreio"."world_visits"."accepted_at"),
	CONSTRAINT "recreio_visit_grant_lifecycle" CHECK (("recreio"."world_visits"."state"='active' and "recreio"."world_visits"."ended_at" is null and "recreio"."world_visits"."end_reason" is null) or ("recreio"."world_visits"."state"<>'active' and "recreio"."world_visits"."ended_at" is not null and "recreio"."world_visits"."end_reason" is not null and "recreio"."world_visits"."ended_at">="recreio"."world_visits"."accepted_at" and "recreio"."world_visits"."ended_at"<="recreio"."world_visits"."updated_at" and (("recreio"."world_visits"."state"='expired' and "recreio"."world_visits"."end_reason"='expired' and "recreio"."world_visits"."ended_at">="recreio"."world_visits"."expires_at") or ("recreio"."world_visits"."state"='revoked' and "recreio"."world_visits"."end_reason" in ('left','host_left','lease_lost','permissions_changed','access_lost','blocked','revoked','world_closed')))))
);
--> statement-breakpoint
ALTER TABLE "recreio"."space_visit_invites" ADD CONSTRAINT "recreio_visit_invite_presence" FOREIGN KEY ("host_presence_id","space_id","origin_profile_id","host_session_id","host_member_id") REFERENCES "recreio"."world_host_presences"("id","space_id","host_profile_id","host_session_id","host_member_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_visit_invites" ADD CONSTRAINT "recreio_visit_invite_target" FOREIGN KEY ("target_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_guardian_approvals" ADD CONSTRAINT "recreio_visit_guardian_participants" FOREIGN KEY ("invite_id","origin_profile_id","target_profile_id") REFERENCES "recreio"."space_visit_invites"("id","origin_profile_id","target_profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_guardian_approvals" ADD CONSTRAINT "recreio_visit_guardian_profile" FOREIGN KEY ("guardian_link_id","profile_id") REFERENCES "recreio"."guardian_links"("id","profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_guardian_approvals" ADD CONSTRAINT "recreio_visit_guardian_user" FOREIGN KEY ("approved_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_world_approvals" ADD CONSTRAINT "recreio_visit_world_approval_invite" FOREIGN KEY ("invite_id","space_id") REFERENCES "recreio"."space_visit_invites"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_world_approvals" ADD CONSTRAINT "recreio_visit_world_approval_member" FOREIGN KEY ("space_id","approved_by_member_id") REFERENCES "recreio"."space_members"("space_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_world_approvals" ADD CONSTRAINT "recreio_visit_world_approval_user" FOREIGN KEY ("approved_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."visit_invite_world_approvals" ADD CONSTRAINT "recreio_visit_world_approval_guardian" FOREIGN KEY ("guardian_link_id") REFERENCES "recreio"."guardian_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."world_visits" ADD CONSTRAINT "recreio_visit_grant_invite" FOREIGN KEY ("invite_id","space_id","visitor_profile_id","host_presence_id") REFERENCES "recreio"."space_visit_invites"("id","space_id","target_profile_id","host_presence_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_visit_invite_one_pending" ON "recreio"."space_visit_invites" USING btree ("space_id","origin_profile_id","target_profile_id","host_presence_id") WHERE "recreio"."space_visit_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_incoming" ON "recreio"."space_visit_invites" USING btree ("target_profile_id","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_outgoing" ON "recreio"."space_visit_invites" USING btree ("origin_profile_id","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_world_pending" ON "recreio"."space_visit_invites" USING btree ("space_id","id") WHERE "recreio"."space_visit_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_presence_pending" ON "recreio"."space_visit_invites" USING btree ("host_presence_id","id") WHERE "recreio"."space_visit_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_expiry" ON "recreio"."space_visit_invites" USING btree ("expires_at","id") WHERE "recreio"."space_visit_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_visit_invite_retention" ON "recreio"."space_visit_invites" USING btree ("retain_until","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_visit_grant_one_active" ON "recreio"."world_visits" USING btree ("space_id","visitor_profile_id") WHERE "recreio"."world_visits"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_visit_grant_visitor" ON "recreio"."world_visits" USING btree ("visitor_profile_id","accepted_at","id");--> statement-breakpoint
CREATE INDEX "recreio_visit_grant_host" ON "recreio"."world_visits" USING btree ("host_presence_id","id") WHERE "recreio"."world_visits"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_visit_grant_world" ON "recreio"."world_visits" USING btree ("space_id","id") WHERE "recreio"."world_visits"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_visit_grant_expiry" ON "recreio"."world_visits" USING btree ("expires_at","id") WHERE "recreio"."world_visits"."ended_at" is null;