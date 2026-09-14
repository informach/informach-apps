CREATE TABLE "missao_saber"."experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"state" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."releases" ADD COLUMN "content_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."experiments" ADD CONSTRAINT "experiments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "missao_experiment_profile_kind" ON "missao_saber"."experiments" USING btree ("profile_id","kind");