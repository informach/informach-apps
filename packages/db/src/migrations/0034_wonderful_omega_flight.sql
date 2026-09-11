ALTER TABLE "cozya"."cooking_sessions" ADD COLUMN "servings" integer;--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD COLUMN "content_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD CONSTRAINT "cozya_cooking_servings_check" CHECK ("cozya"."cooking_sessions"."servings" between 1 and 100);