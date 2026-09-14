CREATE SCHEMA "missao_saber";
--> statement-breakpoint
CREATE TABLE "missao_saber"."attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"family_id" text NOT NULL,
	"answer" text NOT NULL,
	"correct" boolean NOT NULL,
	"help_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."families" (
	"user_id" text PRIMARY KEY NOT NULL,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"daily_minutes" integer DEFAULT 10 NOT NULL,
	CONSTRAINT "missao_daily_minutes" CHECK ("missao_saber"."families"."daily_minutes" in (5, 10, 15, 20))
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."hints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "missao_hint_count" CHECK ("missao_saber"."hints"."count" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nickname" text NOT NULL,
	"grade" integer NOT NULL,
	"avatar" text DEFAULT 'cometa' NOT NULL,
	"course_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "missao_profile_grade" CHECK ("missao_saber"."profiles"."grade" in (6, 7))
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"reviewer_id" text,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"item_id" text NOT NULL,
	"detail" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"version" integer NOT NULL,
	"mode" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"request_key" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."attempts" ADD CONSTRAINT "attempts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "missao_saber"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ADD CONSTRAINT "families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."hints" ADD CONSTRAINT "hints_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "missao_saber"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."notes" ADD CONSTRAINT "notes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."profiles" ADD CONSTRAINT "profiles_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "missao_saber"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."releases" ADD CONSTRAINT "releases_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."sessions" ADD CONSTRAINT "sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "missao_attempt_item" ON "missao_saber"."attempts" USING btree ("session_id","item_id");--> statement-breakpoint
CREATE INDEX "missao_attempt_session" ON "missao_saber"."attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "missao_hint_item" ON "missao_saber"."hints" USING btree ("session_id","item_id");--> statement-breakpoint
CREATE INDEX "missao_notes_profile" ON "missao_saber"."notes" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "missao_profiles_owner" ON "missao_saber"."profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "missao_release_lesson" ON "missao_saber"."releases" USING btree ("lesson_id","version","created_at");--> statement-breakpoint
CREATE INDEX "missao_reports_open" ON "missao_saber"."reports" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missao_session_request" ON "missao_saber"."sessions" USING btree ("profile_id","request_key");--> statement-breakpoint
CREATE INDEX "missao_sessions_profile" ON "missao_saber"."sessions" USING btree ("profile_id","created_at");