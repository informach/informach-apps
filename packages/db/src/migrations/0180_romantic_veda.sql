CREATE TABLE "recreio"."group_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"inviter_user_id" text NOT NULL,
	"inviter_declaration_version" text NOT NULL,
	"recipient_email" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"accepted_profile_id" uuid,
	"accepted_user_id" text,
	"recipient_declaration_version" text,
	"request_hash" text,
	CONSTRAINT "recreio_group_invite_state" CHECK ("recreio"."group_invites"."state" in ('pending','accepted','revoked','expired')),
	CONSTRAINT "recreio_group_invite_expiry" CHECK ("recreio"."group_invites"."expires_at">"recreio"."group_invites"."created_at" and "recreio"."group_invites"."expires_at"<="recreio"."group_invites"."created_at"+interval '72 hours'),
	CONSTRAINT "recreio_group_invite_email" CHECK ("recreio"."group_invites"."recipient_email" is null or
    (char_length("recreio"."group_invites"."recipient_email") between 3 and 254 and "recreio"."group_invites"."recipient_email"=lower(btrim("recreio"."group_invites"."recipient_email")))),
	CONSTRAINT "recreio_group_invite_declarations" CHECK ("recreio"."group_invites"."inviter_declaration_version" ~ '^adulto-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and ("recreio"."group_invites"."recipient_declaration_version" is null or "recreio"."group_invites"."recipient_declaration_version" ~ '^adulto-[0-9]{4}-[0-9]{2}-[0-9]{2}$')),
	CONSTRAINT "recreio_group_invite_lifecycle" CHECK (
    ("recreio"."group_invites"."state"='pending' and "recreio"."group_invites"."recipient_email" is not null and "recreio"."group_invites"."finished_at" is null
      and "recreio"."group_invites"."accepted_profile_id" is null and "recreio"."group_invites"."accepted_user_id" is null
      and "recreio"."group_invites"."recipient_declaration_version" is null and "recreio"."group_invites"."request_hash" is null)
    or ("recreio"."group_invites"."state"='accepted' and "recreio"."group_invites"."recipient_email" is null and "recreio"."group_invites"."finished_at" is not null
      and "recreio"."group_invites"."finished_at">="recreio"."group_invites"."created_at" and "recreio"."group_invites"."finished_at"<"recreio"."group_invites"."expires_at"
      and "recreio"."group_invites"."recipient_declaration_version" is not null
      and "recreio"."group_invites"."request_hash" is not null and "recreio"."group_invites"."request_hash" ~ '^[a-f0-9]{64}$'
      and (("recreio"."group_invites"."accepted_profile_id" is null and "recreio"."group_invites"."accepted_user_id" is null)
        or ("recreio"."group_invites"."accepted_profile_id" is not null and "recreio"."group_invites"."accepted_user_id" is not null)))
    or ("recreio"."group_invites"."state" in ('revoked','expired') and "recreio"."group_invites"."recipient_email" is null and "recreio"."group_invites"."finished_at" is not null
      and "recreio"."group_invites"."finished_at">="recreio"."group_invites"."created_at" and ("recreio"."group_invites"."state"<>'expired' or "recreio"."group_invites"."finished_at">="recreio"."group_invites"."expires_at")
      and "recreio"."group_invites"."accepted_profile_id" is null and "recreio"."group_invites"."accepted_user_id" is null
      and "recreio"."group_invites"."recipient_declaration_version" is null and "recreio"."group_invites"."request_hash" is null))
);
--> statement-breakpoint
ALTER TABLE "recreio"."group_invites" ADD CONSTRAINT "recreio_group_invite_owner" FOREIGN KEY ("group_id","inviter_user_id") REFERENCES "recreio"."groups"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."group_invites" ADD CONSTRAINT "recreio_group_invite_recipient" FOREIGN KEY ("accepted_profile_id","accepted_user_id") REFERENCES "recreio"."profiles"("id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_group_invite_pending_recipient" ON "recreio"."group_invites" USING btree ("group_id","recipient_email") WHERE "recreio"."group_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_group_invite_incoming" ON "recreio"."group_invites" USING btree ("recipient_email","expires_at") WHERE "recreio"."group_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_group_invite_expiry" ON "recreio"."group_invites" USING btree ("expires_at") WHERE "recreio"."group_invites"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_group_invite_retention" ON "recreio"."group_invites" USING btree ("finished_at") WHERE "recreio"."group_invites"."state"<>'pending';