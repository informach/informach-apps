CREATE TABLE "cozya"."cooking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"recipe_version" timestamp with time zone NOT NULL,
	"checked_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timer_ends_at" timestamp with time zone,
	"cooked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cozya"."meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"slot" text NOT NULL,
	"recipe_id" uuid,
	"label" text NOT NULL,
	"servings" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cozya_meals_servings_check" CHECK ("cozya"."meals"."servings" between 1 and 100),
	CONSTRAINT "cozya_meals_slot_check" CHECK ("cozya"."meals"."slot" in ('lunch', 'dinner'))
);
--> statement-breakpoint
CREATE TABLE "cozya"."product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"dedup_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cozya"."profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"household_size" integer DEFAULT 2 NOT NULL,
	"preferences" text DEFAULT '' NOT NULL,
	"trial_started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cozya_profiles_household_check" CHECK ("cozya"."profiles"."household_size" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "cozya"."shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"amount" text NOT NULL,
	"category" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'todo' NOT NULL,
	CONSTRAINT "cozya_shopping_items_state_check" CHECK ("cozya"."shopping_items"."state" in ('todo', 'have', 'bought'))
);
--> statement-breakpoint
CREATE TABLE "cozya"."shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cozya"."trial_claims" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD COLUMN "servings" integer;--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD COLUMN "total_minutes" integer;--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD COLUMN "structured_ingredients" jsonb;--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD COLUMN "source_name" text;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD CONSTRAINT "cooking_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."cooking_sessions" ADD CONSTRAINT "cooking_sessions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cozya"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."meals" ADD CONSTRAINT "meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "cozya"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."product_events" ADD CONSTRAINT "product_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."shopping_items" ADD CONSTRAINT "shopping_items_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "cozya"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cozya"."trial_claims" ADD CONSTRAINT "trial_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cozya_cooking_user_recipe_idx" ON "cozya"."cooking_sessions" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cozya_meals_user_day_slot_idx" ON "cozya"."meals" USING btree ("user_id","day","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "cozya_product_event_dedup_idx" ON "cozya"."product_events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "cozya_product_event_name_time_idx" ON "cozya"."product_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cozya_shopping_items_list_key_idx" ON "cozya"."shopping_items" USING btree ("list_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "cozya_shopping_user_week_idx" ON "cozya"."shopping_lists" USING btree ("user_id","week");--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD CONSTRAINT "cozya_recipes_servings_check" CHECK ("cozya"."recipes"."servings" between 1 and 100);--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD CONSTRAINT "cozya_recipes_minutes_check" CHECK ("cozya"."recipes"."total_minutes" between 1 and 10080);