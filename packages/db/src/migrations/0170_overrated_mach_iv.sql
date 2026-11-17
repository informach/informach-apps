CREATE TABLE "recreio"."minor_protection" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"guardian_link_id" uuid NOT NULL,
	"access_generation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"pin_hash" text,
	"pin_generation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_minor_pin_hash" CHECK ("recreio"."minor_protection"."pin_hash" is null or "recreio"."minor_protection"."pin_hash" ~ '^scrypt-v1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
CREATE TABLE "recreio"."native_pins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"generation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_native_pin_hash" CHECK ("recreio"."native_pins"."hash" ~ '^scrypt-v1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
CREATE TABLE "recreio"."paired_credentials" (
	"device_session_id" uuid PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"guardian_user_id" text NOT NULL,
	"access_generation" uuid NOT NULL,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_paired_token_hash" UNIQUE("token_hash"),
	CONSTRAINT "recreio_paired_token_format" CHECK ("recreio"."paired_credentials"."token_hash" is null or "recreio"."paired_credentials"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "recreio"."pairing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"poll_hash" text NOT NULL,
	"profile_id" uuid,
	"guardian_link_id" uuid,
	"device_session_id" uuid,
	"approved_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_pairing_code_hash" UNIQUE("code_hash"),
	CONSTRAINT "recreio_pairing_poll_hash" UNIQUE("poll_hash"),
	CONSTRAINT "recreio_pairing_device" UNIQUE("device_session_id"),
	CONSTRAINT "recreio_pairing_hashes" CHECK ("recreio"."pairing_requests"."code_hash" ~ '^[a-f0-9]{64}$' and "recreio"."pairing_requests"."poll_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "recreio_pairing_expiry" CHECK ("recreio"."pairing_requests"."expires_at" > "recreio"."pairing_requests"."created_at"),
	CONSTRAINT "recreio_pairing_approval" CHECK (("recreio"."pairing_requests"."approved_at" is null and "recreio"."pairing_requests"."profile_id" is null and "recreio"."pairing_requests"."guardian_link_id" is null and "recreio"."pairing_requests"."device_session_id" is null and "recreio"."pairing_requests"."claimed_at" is null) or ("recreio"."pairing_requests"."approved_at" is not null and "recreio"."pairing_requests"."profile_id" is not null and "recreio"."pairing_requests"."guardian_link_id" is not null and "recreio"."pairing_requests"."device_session_id" is not null and "recreio"."pairing_requests"."approved_at" >= "recreio"."pairing_requests"."created_at" and "recreio"."pairing_requests"."approved_at" < "recreio"."pairing_requests"."expires_at" and ("recreio"."pairing_requests"."claimed_at" is null or "recreio"."pairing_requests"."claimed_at" >= "recreio"."pairing_requests"."approved_at")))
);
--> statement-breakpoint
ALTER TABLE "recreio"."minor_protection" ADD CONSTRAINT "minor_protection_profile_id_minor_profiles_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_profiles"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."minor_protection" ADD CONSTRAINT "minor_protection_guardian_link_id_guardian_links_id_fk" FOREIGN KEY ("guardian_link_id") REFERENCES "recreio"."guardian_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."native_pins" ADD CONSTRAINT "native_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."paired_credentials" ADD CONSTRAINT "paired_credentials_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "recreio"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."paired_credentials" ADD CONSTRAINT "paired_credentials_profile_id_minor_protection_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_protection"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."paired_credentials" ADD CONSTRAINT "paired_credentials_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "core"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."pairing_requests" ADD CONSTRAINT "pairing_requests_profile_id_minor_profiles_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_profiles"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."pairing_requests" ADD CONSTRAINT "pairing_requests_guardian_link_id_guardian_links_id_fk" FOREIGN KEY ("guardian_link_id") REFERENCES "recreio"."guardian_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."pairing_requests" ADD CONSTRAINT "pairing_requests_device_session_id_device_sessions_id_fk" FOREIGN KEY ("device_session_id") REFERENCES "recreio"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_paired_profile" ON "recreio"."paired_credentials" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "recreio_pairing_retention" ON "recreio"."pairing_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "recreio_profile_creation_pending_expiry" ON "recreio"."profile_creation_requests" USING btree ("expires_at") WHERE "recreio"."profile_creation_requests"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "recreio_profile_creation_consumed_retention" ON "recreio"."profile_creation_requests" USING btree ("consumed_at") WHERE "recreio"."profile_creation_requests"."consumed_at" is not null;