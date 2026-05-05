CREATE TABLE "cozya"."recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"ingredients" text NOT NULL,
	"preparation" text NOT NULL,
	"finishing" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cozya"."recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cozya_recipes_user_created_idx" ON "cozya"."recipes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "cozya_recipes_user_favorite_idx" ON "cozya"."recipes" USING btree ("user_id","is_favorite");