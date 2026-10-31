CREATE SCHEMA "bora_treinar";
--> statement-breakpoint
CREATE TABLE "bora_treinar"."achievements" (
	"profile_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"session_id" uuid,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_profile_id_achievement_id_pk" PRIMARY KEY("profile_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."chain_progress" (
	"profile_id" uuid NOT NULL,
	"chain_id" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"bonus" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_progress_profile_id_chain_id_pk" PRIMARY KEY("profile_id","chain_id"),
	CONSTRAINT "bora_chain_progress_values" CHECK ("bora_treinar"."chain_progress"."level" >= 0 and "bora_treinar"."chain_progress"."bonus" >= 0 and "bora_treinar"."chain_progress"."streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."challenges" (
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"metric" text NOT NULL,
	"exercise_id" text,
	"target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_user_id_week_start_pk" PRIMARY KEY("user_id","week_start"),
	CONSTRAINT "bora_challenges_metric" CHECK ("bora_treinar"."challenges"."metric" in ('repeticoes', 'minutos', 'treinos', 'exercicio')),
	CONSTRAINT "bora_challenges_target" CHECK ("bora_treinar"."challenges"."target" between 1 and 100000)
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."custom_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"level" text NOT NULL,
	"focus" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bora_custom_workouts_name" CHECK (char_length("bora_treinar"."custom_workouts"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."families" (
	"user_id" text PRIMARY KEY NOT NULL,
	"reminder_days" integer DEFAULT 0 NOT NULL,
	"reminder_hour" integer DEFAULT 18 NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"weekly_summary" boolean DEFAULT false NOT NULL,
	"weekly_summary_week" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bora_families_reminder_days" CHECK ("bora_treinar"."families"."reminder_days" between 0 and 127),
	CONSTRAINT "bora_families_reminder_hour" CHECK ("bora_treinar"."families"."reminder_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"access_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bora_profiles_name" CHECK (char_length("bora_treinar"."profiles"."name") between 1 and 24),
	CONSTRAINT "bora_profiles_color" CHECK ("bora_treinar"."profiles"."color" ~ '^#[0-9A-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" uuid NOT NULL,
	"workout_ref" text NOT NULL,
	"workout_name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bora_sessions_mode" CHECK ("bora_treinar"."sessions"."mode" in ('camera', 'manual', 'pareado')),
	CONSTRAINT "bora_sessions_duration" CHECK ("bora_treinar"."sessions"."duration_seconds" between 0 and 14400)
);
--> statement-breakpoint
CREATE TABLE "bora_treinar"."set_logs" (
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"exercise_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" integer,
	"reps" integer DEFAULT 0 NOT NULL,
	"partials" integer DEFAULT 0 NOT NULL,
	"hold_seconds" integer DEFAULT 0 NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"issues" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "set_logs_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "bora_set_logs_kind" CHECK ("bora_treinar"."set_logs"."kind" in ('reps', 'hold')),
	CONSTRAINT "bora_set_logs_values" CHECK ("bora_treinar"."set_logs"."reps" >= 0 and "bora_treinar"."set_logs"."partials" >= 0 and "bora_treinar"."set_logs"."hold_seconds" >= 0 and "bora_treinar"."set_logs"."seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bora_treinar"."achievements" ADD CONSTRAINT "achievements_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "bora_treinar"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."achievements" ADD CONSTRAINT "achievements_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "bora_treinar"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."chain_progress" ADD CONSTRAINT "chain_progress_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "bora_treinar"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ADD CONSTRAINT "challenges_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "bora_treinar"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."custom_workouts" ADD CONSTRAINT "custom_workouts_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "bora_treinar"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."families" ADD CONSTRAINT "families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "profiles_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "bora_treinar"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD CONSTRAINT "sessions_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "bora_treinar"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD CONSTRAINT "sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "bora_treinar"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."set_logs" ADD CONSTRAINT "set_logs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "bora_treinar"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bora_custom_workouts_owner" ON "bora_treinar"."custom_workouts" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "bora_profiles_owner" ON "bora_treinar"."profiles" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bora_sessions_profile_started" ON "bora_treinar"."sessions" USING btree ("profile_id","started_at");--> statement-breakpoint
CREATE INDEX "bora_sessions_user_started" ON "bora_treinar"."sessions" USING btree ("user_id","started_at");