CREATE TABLE "recreio"."minor_daily_usage" (
	"profile_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"used_milliseconds" integer DEFAULT 0 NOT NULL,
	"accounted_until" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"session_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "minor_daily_usage_profile_id_local_day_pk" PRIMARY KEY("profile_id","local_day"),
	CONSTRAINT "recreio_minor_usage_bounds" CHECK ("recreio"."minor_daily_usage"."used_milliseconds" between 0 and 172800000),
	CONSTRAINT "recreio_minor_usage_interval" CHECK ("recreio"."minor_daily_usage"."lease_until" is null or "recreio"."minor_daily_usage"."lease_until" >= "recreio"."minor_daily_usage"."accounted_until")
);
--> statement-breakpoint
CREATE TABLE "recreio"."minor_policies" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"content_limit" text,
	"multiplayer_enabled" boolean DEFAULT true NOT NULL,
	"free_text_enabled" boolean DEFAULT false NOT NULL,
	"contacts_enabled" boolean DEFAULT true NOT NULL,
	"presence_mode" text DEFAULT 'friends' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"daily_minutes" integer,
	"weekly_schedule" jsonb,
	"effective_social" text,
	"effective_rating" text,
	"effective_profile_version" integer DEFAULT 0 NOT NULL,
	"acknowledged_version" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recreio_minor_content_limit" CHECK ("recreio"."minor_policies"."content_limit" is null or "recreio"."minor_policies"."content_limit" in ('L','6','10','12','14','16')),
	CONSTRAINT "recreio_minor_presence" CHECK ("recreio"."minor_policies"."presence_mode" in ('invisible','friends')),
	CONSTRAINT "recreio_minor_daily_minutes" CHECK ("recreio"."minor_policies"."daily_minutes" is null or "recreio"."minor_policies"."daily_minutes" between 1 and 1440),
	CONSTRAINT "recreio_minor_schedule" CHECK (case when "recreio"."minor_policies"."weekly_schedule" is null then true when jsonb_typeof("recreio"."minor_policies"."weekly_schedule")='array' then jsonb_array_length("recreio"."minor_policies"."weekly_schedule") <= 14 else false end),
	CONSTRAINT "recreio_minor_policy_version" CHECK ("recreio"."minor_policies"."effective_profile_version" between 0 and 2147483646 and "recreio"."minor_policies"."acknowledged_version" between 0 and "recreio"."minor_policies"."effective_profile_version"),
	CONSTRAINT "recreio_minor_policy_computation" CHECK (("recreio"."minor_policies"."effective_profile_version"=0 and "recreio"."minor_policies"."effective_social" is null and "recreio"."minor_policies"."effective_rating" is null and "recreio"."minor_policies"."computed_at" is null) or ("recreio"."minor_policies"."effective_profile_version">0 and "recreio"."minor_policies"."effective_social" is not null and "recreio"."minor_policies"."effective_social" in ('ate_12','13_17') and "recreio"."minor_policies"."effective_rating" is not null and "recreio"."minor_policies"."effective_rating" in ('L','6','10','12','14','16') and "recreio"."minor_policies"."computed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "recreio"."minor_daily_usage" ADD CONSTRAINT "minor_daily_usage_profile_id_minor_profiles_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_profiles"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."minor_daily_usage" ADD CONSTRAINT "recreio_minor_usage_session_profile" FOREIGN KEY ("session_id","profile_id") REFERENCES "recreio"."game_sessions"("id","profile_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recreio"."minor_policies" ADD CONSTRAINT "minor_policies_profile_id_minor_profiles_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "recreio"."minor_profiles"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recreio_minor_usage_retention" ON "recreio"."minor_daily_usage" USING btree ("local_day","profile_id");