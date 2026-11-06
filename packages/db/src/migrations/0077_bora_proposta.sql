CREATE TABLE "bora_treinar"."trial_claims" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" DROP CONSTRAINT "challenges_user_id_week_start_pk";--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "bora_treinar"."families" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD COLUMN "intensity" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD COLUMN "weekly_goal" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD COLUMN "minutes_pref" integer;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD COLUMN "feeling" text;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD COLUMN "ended_early" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "bora_treinar"."trial_claims" ADD CONSTRAINT "trial_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bora_treinar"."challenges" ADD CONSTRAINT "challenges_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "bora_treinar"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bora_challenges_family_week" ON "bora_treinar"."challenges" USING btree ("user_id","week_start") WHERE "bora_treinar"."challenges"."profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "bora_challenges_profile_week" ON "bora_treinar"."challenges" USING btree ("profile_id","week_start") WHERE "bora_treinar"."challenges"."profile_id" is not null;--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "bora_profiles_intensity" CHECK ("bora_treinar"."profiles"."intensity" in ('leve', 'normal', 'forte'));--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "bora_profiles_weekly_goal" CHECK ("bora_treinar"."profiles"."weekly_goal" between 1 and 7);--> statement-breakpoint
ALTER TABLE "bora_treinar"."profiles" ADD CONSTRAINT "bora_profiles_minutes_pref" CHECK ("bora_treinar"."profiles"."minutes_pref" is null or "bora_treinar"."profiles"."minutes_pref" in (10, 20, 30));--> statement-breakpoint
ALTER TABLE "bora_treinar"."sessions" ADD CONSTRAINT "bora_sessions_feeling" CHECK ("bora_treinar"."sessions"."feeling" is null or "bora_treinar"."sessions"."feeling" in ('facil', 'na_medida', 'dificil'));--> statement-breakpoint
-- Perfis que já existiam não passam pelo primeiro acesso: eles já treinam e já têm nível.
UPDATE "bora_treinar"."profiles" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL;
