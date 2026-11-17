CREATE TABLE "recreio"."profile_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_achievement_scope" UNIQUE("profile_id","game_id","achievement_id"),
	CONSTRAINT "recreio_achievement_retry" UNIQUE("profile_id","game_id","key_hash"),
	CONSTRAINT "recreio_achievement_id" CHECK ("recreio"."profile_achievements"."achievement_id" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
	CONSTRAINT "recreio_achievement_hash" CHECK ("recreio"."profile_achievements"."key_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "recreio"."profile_data_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"key" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_data_key_scope" UNIQUE("profile_id","game_id","key"),
	CONSTRAINT "recreio_data_key_identity" UNIQUE("id","profile_id","game_id"),
	CONSTRAINT "recreio_data_key_format" CHECK ("recreio"."profile_data_keys"."key" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'),
	CONSTRAINT "recreio_data_key_revision" CHECK ("recreio"."profile_data_keys"."revision" between 0 and 2147483646)
);
--> statement-breakpoint
CREATE TABLE "recreio"."profile_data_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"base_revision" integer NOT NULL,
	"revision" integer,
	"kind" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_data_version_state" CHECK (("recreio"."profile_data_versions"."kind" = 'accepted' and "recreio"."profile_data_versions"."revision" is not null and "recreio"."profile_data_versions"."revision" = "recreio"."profile_data_versions"."base_revision" + 1) or ("recreio"."profile_data_versions"."kind" = 'conflict' and "recreio"."profile_data_versions"."revision" is null)),
	CONSTRAINT "recreio_data_version_revision_bounds" CHECK ("recreio"."profile_data_versions"."base_revision" between 0 and 2147483646 and ("recreio"."profile_data_versions"."revision" is null or "recreio"."profile_data_versions"."revision" between 1 and 2147483646)),
	CONSTRAINT "recreio_data_version_bytes" CHECK (octet_length("recreio"."profile_data_versions"."bytes") <= 65536),
	CONSTRAINT "recreio_data_version_digest" CHECK ("recreio"."profile_data_versions"."digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "recreio"."profile_achievements" ADD CONSTRAINT "profile_achievements_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_data_keys" ADD CONSTRAINT "profile_data_keys_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."profile_data_versions" ADD CONSTRAINT "recreio_data_version_scope" FOREIGN KEY ("data_id","profile_id","game_id") REFERENCES "recreio"."profile_data_keys"("id","profile_id","game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_data_version_history" ON "recreio"."profile_data_versions" USING btree ("data_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_data_version_revision" ON "recreio"."profile_data_versions" USING btree ("data_id","revision") WHERE "recreio"."profile_data_versions"."kind" = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX "recreio_data_conflict_retry" ON "recreio"."profile_data_versions" USING btree ("data_id","base_revision","digest") WHERE "recreio"."profile_data_versions"."kind" = 'conflict';