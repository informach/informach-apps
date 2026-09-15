CREATE TABLE "missao_saber"."family_challenges" (
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"goal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_challenges_user_id_week_start_pk" PRIMARY KEY("user_id","week_start"),
	CONSTRAINT "missao_family_challenge_goal" CHECK ("missao_saber"."family_challenges"."goal" between 4 and 40)
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ADD COLUMN "weekly_report_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."family_challenges" ADD CONSTRAINT "family_challenges_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "missao_saber"."families"("user_id") ON DELETE cascade ON UPDATE no action;