CREATE TABLE "recreio"."friend_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "recreio_friend_code_digest" CHECK ("recreio"."friend_codes"."code_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_friend_code_expiry" CHECK ("recreio"."friend_codes"."expires_at">"recreio"."friend_codes"."created_at" and "recreio"."friend_codes"."expires_at"<="recreio"."friend_codes"."created_at"+interval '30 minutes'),
	CONSTRAINT "recreio_friend_code_lifecycle" CHECK (("recreio"."friend_codes"."consumed_at" is null or ("recreio"."friend_codes"."consumed_at">="recreio"."friend_codes"."created_at" and "recreio"."friend_codes"."consumed_at"<"recreio"."friend_codes"."expires_at")) and ("recreio"."friend_codes"."revoked_at" is null or "recreio"."friend_codes"."revoked_at">="recreio"."friend_codes"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "recreio"."friend_consents" (
	"request_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"guardian_link_id" uuid NOT NULL,
	"approved_by_user_id" text,
	"access_generation" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_consents_request_id_profile_id_pk" PRIMARY KEY("request_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "recreio"."friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"code_id" uuid,
	"client_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"target_accepted_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "recreio_friend_request_distinct" CHECK ("recreio"."friend_requests"."origin_profile_id"<>"recreio"."friend_requests"."target_profile_id"),
	CONSTRAINT "recreio_friend_request_digest" CHECK ("recreio"."friend_requests"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_friend_request_state" CHECK ("recreio"."friend_requests"."state" in ('pending','accepted','rejected','revoked','expired')),
	CONSTRAINT "recreio_friend_request_expiry" CHECK ("recreio"."friend_requests"."expires_at">"recreio"."friend_requests"."created_at" and "recreio"."friend_requests"."expires_at"<="recreio"."friend_requests"."created_at"+interval '72 hours'),
	CONSTRAINT "recreio_friend_request_acceptance" CHECK ("recreio"."friend_requests"."target_accepted_at" is null or ("recreio"."friend_requests"."target_accepted_at">="recreio"."friend_requests"."created_at" and "recreio"."friend_requests"."target_accepted_at"<"recreio"."friend_requests"."expires_at")),
	CONSTRAINT "recreio_friend_request_lifecycle" CHECK (
    ("recreio"."friend_requests"."state"='pending' and "recreio"."friend_requests"."finished_at" is null)
    or ("recreio"."friend_requests"."state"='accepted' and "recreio"."friend_requests"."target_accepted_at" is not null and "recreio"."friend_requests"."finished_at" is not null
      and "recreio"."friend_requests"."finished_at">="recreio"."friend_requests"."target_accepted_at" and "recreio"."friend_requests"."finished_at"<"recreio"."friend_requests"."expires_at")
    or ("recreio"."friend_requests"."state" in ('rejected','revoked','expired') and "recreio"."friend_requests"."finished_at" is not null
      and "recreio"."friend_requests"."finished_at">="recreio"."friend_requests"."created_at" and ("recreio"."friend_requests"."state"<>'expired' or "recreio"."friend_requests"."finished_at">="recreio"."friend_requests"."expires_at")))
);
--> statement-breakpoint
CREATE TABLE "recreio"."friendships" (
	"lower_profile_id" uuid NOT NULL,
	"higher_profile_id" uuid NOT NULL,
	"request_id" uuid,
	"state" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "friendships_lower_profile_id_higher_profile_id_pk" PRIMARY KEY("lower_profile_id","higher_profile_id"),
	CONSTRAINT "recreio_friendship_pair" CHECK ("recreio"."friendships"."lower_profile_id"<"recreio"."friendships"."higher_profile_id"),
	CONSTRAINT "recreio_friendship_revision" CHECK ("recreio"."friendships"."revision" between 1 and 2147483646),
	CONSTRAINT "recreio_friendship_lifecycle" CHECK (("recreio"."friendships"."state"='active' and "recreio"."friendships"."request_id" is not null and "recreio"."friendships"."removed_at" is null) or ("recreio"."friendships"."state"='removed' and "recreio"."friendships"."removed_at" is not null and "recreio"."friendships"."removed_at">="recreio"."friendships"."created_at"))
);
--> statement-breakpoint
CREATE TABLE "recreio"."social_blocks" (
	"actor_profile_id" uuid NOT NULL,
	"target_profile_id" uuid NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_blocks_actor_profile_id_target_profile_id_pk" PRIMARY KEY("actor_profile_id","target_profile_id"),
	CONSTRAINT "recreio_social_block_distinct" CHECK ("recreio"."social_blocks"."actor_profile_id"<>"recreio"."social_blocks"."target_profile_id"),
	CONSTRAINT "recreio_social_block_effect" CHECK ("recreio"."social_blocks"."blocked" or "recreio"."social_blocks"."muted")
);
--> statement-breakpoint
CREATE TABLE "recreio"."social_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "recreio_social_notice_read" CHECK ("recreio"."social_notices"."read_at" is null or "recreio"."social_notices"."read_at">="recreio"."social_notices"."created_at")
);
--> statement-breakpoint
CREATE TABLE "recreio"."social_preferences" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"presence_mode" text DEFAULT 'friends' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_social_presence_mode" CHECK ("recreio"."social_preferences"."presence_mode" in ('online','friends','invisible'))
);
--> statement-breakpoint
ALTER TABLE "recreio"."friend_codes" ADD CONSTRAINT "friend_codes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "friend_consents_request_id_friend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "recreio"."friend_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "friend_consents_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "friend_consents_guardian_link_id_guardian_links_id_fk" FOREIGN KEY ("guardian_link_id") REFERENCES "recreio"."guardian_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_consents" ADD CONSTRAINT "friend_consents_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD CONSTRAINT "friend_requests_origin_profile_id_profiles_id_fk" FOREIGN KEY ("origin_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD CONSTRAINT "friend_requests_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friend_requests" ADD CONSTRAINT "friend_requests_code_id_friend_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "recreio"."friend_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friendships" ADD CONSTRAINT "friendships_lower_profile_id_profiles_id_fk" FOREIGN KEY ("lower_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friendships" ADD CONSTRAINT "friendships_higher_profile_id_profiles_id_fk" FOREIGN KEY ("higher_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."friendships" ADD CONSTRAINT "friendships_request_id_friend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "recreio"."friend_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_blocks" ADD CONSTRAINT "social_blocks_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_blocks" ADD CONSTRAINT "social_blocks_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD CONSTRAINT "social_notices_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD CONSTRAINT "social_notices_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_notices" ADD CONSTRAINT "social_notices_request_id_friend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "recreio"."friend_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."social_preferences" ADD CONSTRAINT "social_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_friend_code_hash" ON "recreio"."friend_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_friend_code_open" ON "recreio"."friend_codes" USING btree ("profile_id") WHERE "recreio"."friend_codes"."consumed_at" is null and "recreio"."friend_codes"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_friend_code_expiry" ON "recreio"."friend_codes" USING btree ("expires_at","id");--> statement-breakpoint
CREATE INDEX "recreio_friend_consent_profile" ON "recreio"."friend_consents" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_friend_request_retry" ON "recreio"."friend_requests" USING btree ("origin_profile_id","client_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_friend_request_code" ON "recreio"."friend_requests" USING btree ("code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_friend_request_pair" ON "recreio"."friend_requests" USING btree (least("origin_profile_id","target_profile_id"),greatest("origin_profile_id","target_profile_id")) WHERE "recreio"."friend_requests"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_friend_request_outgoing" ON "recreio"."friend_requests" USING btree ("origin_profile_id","expires_at") WHERE "recreio"."friend_requests"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_friend_request_incoming" ON "recreio"."friend_requests" USING btree ("target_profile_id","expires_at") WHERE "recreio"."friend_requests"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_friend_request_expiry" ON "recreio"."friend_requests" USING btree ("expires_at","id") WHERE "recreio"."friend_requests"."state"='pending';--> statement-breakpoint
CREATE INDEX "recreio_friend_request_retention" ON "recreio"."friend_requests" USING btree ("finished_at","id") WHERE "recreio"."friend_requests"."state"<>'pending';--> statement-breakpoint
CREATE INDEX "recreio_friendship_lower" ON "recreio"."friendships" USING btree ("lower_profile_id","higher_profile_id") WHERE "recreio"."friendships"."state"='active';--> statement-breakpoint
CREATE INDEX "recreio_friendship_higher" ON "recreio"."friendships" USING btree ("higher_profile_id","lower_profile_id") WHERE "recreio"."friendships"."state"='active';--> statement-breakpoint
CREATE INDEX "recreio_friendship_retention" ON "recreio"."friendships" USING btree ("removed_at") WHERE "recreio"."friendships"."state"='removed';--> statement-breakpoint
CREATE INDEX "recreio_friendship_request" ON "recreio"."friendships" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "recreio_social_block_target" ON "recreio"."social_blocks" USING btree ("target_profile_id","actor_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_social_notice_once" ON "recreio"."social_notices" USING btree ("guardian_user_id","profile_id","request_id");--> statement-breakpoint
CREATE INDEX "recreio_social_notice_guardian" ON "recreio"."social_notices" USING btree ("guardian_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "recreio_social_notice_retention" ON "recreio"."social_notices" USING btree ("created_at","id");