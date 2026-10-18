ALTER TABLE "cozya"."cooking_sessions" ADD COLUMN "last_cooked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD COLUMN "noted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cozya"."meals" ADD COLUMN "lunchbox_servings" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD CONSTRAINT "cozya_cooking_verdict_check" CHECK ("cozya"."cooking_sessions"."verdict" is null or "cozya"."cooking_sessions"."verdict" in ('again', 'tweak', 'skip'));--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD CONSTRAINT "cozya_cooking_note_check" CHECK ("cozya"."cooking_sessions"."note" is null or char_length("cozya"."cooking_sessions"."note") <= 500);--> statement-breakpoint
ALTER TABLE "cozya"."meals" ADD CONSTRAINT "cozya_meals_lunchbox_check" CHECK ("cozya"."meals"."lunchbox_servings" between 0 and "cozya"."meals"."servings");--> statement-breakpoint
-- History starts from what each session already recorded.
UPDATE "cozya"."cooking_sessions" SET "last_cooked_at" = "cooked_at" WHERE "cooked_at" IS NOT NULL;
