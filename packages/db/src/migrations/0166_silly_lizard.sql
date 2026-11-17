CREATE TABLE "recreio"."space_stewardship_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "recreio_stewardship_distinct_members" CHECK ("recreio"."space_stewardship_requests"."from_member_id" <> "recreio"."space_stewardship_requests"."to_member_id"),
	CONSTRAINT "recreio_stewardship_state" CHECK ("recreio"."space_stewardship_requests"."state" in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
	CONSTRAINT "recreio_stewardship_completion" CHECK (
      ("recreio"."space_stewardship_requests"."state" = 'pending' and "recreio"."space_stewardship_requests"."completed_at" is null)
      or ("recreio"."space_stewardship_requests"."state" <> 'pending' and "recreio"."space_stewardship_requests"."completed_at" is not null)),
	CONSTRAINT "recreio_stewardship_expiry" CHECK ("recreio"."space_stewardship_requests"."expires_at" > "recreio"."space_stewardship_requests"."created_at"),
	CONSTRAINT "recreio_stewardship_completion_time" CHECK ("recreio"."space_stewardship_requests"."completed_at" is null or "recreio"."space_stewardship_requests"."completed_at" >= "recreio"."space_stewardship_requests"."created_at"),
	CONSTRAINT "recreio_stewardship_acceptance_time" CHECK ("recreio"."space_stewardship_requests"."state" <> 'accepted' or "recreio"."space_stewardship_requests"."completed_at" < "recreio"."space_stewardship_requests"."expires_at"),
	CONSTRAINT "recreio_stewardship_expiration_time" CHECK ("recreio"."space_stewardship_requests"."state" <> 'expired' or "recreio"."space_stewardship_requests"."completed_at" >= "recreio"."space_stewardship_requests"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" DROP CONSTRAINT "recreio_game_sessions_end_reason";--> statement-breakpoint
ALTER TABLE "recreio"."space_stewardship_requests" ADD CONSTRAINT "space_stewardship_requests_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "recreio"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_stewardship_requests" ADD CONSTRAINT "recreio_stewardship_from_member_world_fk" FOREIGN KEY ("space_id","from_member_id") REFERENCES "recreio"."space_members"("space_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_stewardship_requests" ADD CONSTRAINT "recreio_stewardship_to_member_world_fk" FOREIGN KEY ("space_id","to_member_id") REFERENCES "recreio"."space_members"("space_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_stewardship_pending_world" ON "recreio"."space_stewardship_requests" USING btree ("space_id") WHERE "recreio"."space_stewardship_requests"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "recreio_stewardship_recipient_pending" ON "recreio"."space_stewardship_requests" USING btree ("to_member_id","id") WHERE "recreio"."space_stewardship_requests"."state" = 'pending';--> statement-breakpoint
ALTER TABLE "recreio"."space_invites" ADD CONSTRAINT "recreio_space_invites_inviter_world_fk" FOREIGN KEY ("space_id","invited_by_member_id") REFERENCES "recreio"."space_members"("space_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."space_members" ADD CONSTRAINT "recreio_space_members_inviter_world_fk" FOREIGN KEY ("space_id","invited_by_member_id") REFERENCES "recreio"."space_members"("space_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."game_sessions" ADD CONSTRAINT "recreio_game_sessions_end_reason" CHECK ("recreio"."game_sessions"."end_reason" is null or "recreio"."game_sessions"."end_reason" in ('left', 'replaced', 'access_lost', 'signed_out', 'expired', 'permissions_changed'));