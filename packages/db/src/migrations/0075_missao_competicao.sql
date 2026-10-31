CREATE TABLE "missao_saber"."competition_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"lesson_id" text,
	"item_id" text,
	"item" jsonb,
	"puzzle_id" text,
	"seconds" integer NOT NULL,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"answer" text,
	"result" text,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "missao_competition_turn_content" CHECK (("missao_saber"."competition_turns"."kind" = 'problem' and "missao_saber"."competition_turns"."item_id" is not null and "missao_saber"."competition_turns"."item" is not null and "missao_saber"."competition_turns"."lesson_id" is not null and "missao_saber"."competition_turns"."puzzle_id" is null) or ("missao_saber"."competition_turns"."kind" = 'challenge' and "missao_saber"."competition_turns"."puzzle_id" is not null and "missao_saber"."competition_turns"."item_id" is null)),
	CONSTRAINT "missao_competition_turn_points" CHECK ("missao_saber"."competition_turns"."points" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"area" text NOT NULL,
	"problem_count" integer NOT NULL,
	"challenge_count" integer NOT NULL,
	"problem_seconds" integer NOT NULL,
	"challenge_seconds" integer NOT NULL,
	"seed" integer NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"request_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "missao_competition_title" CHECK (length("missao_saber"."competitions"."title") between 2 and 60),
	CONSTRAINT "missao_competition_counts" CHECK ("missao_saber"."competitions"."problem_count" between 0 and 20 and "missao_saber"."competitions"."challenge_count" between 0 and 3 and "missao_saber"."competitions"."problem_count" + "missao_saber"."competitions"."challenge_count" > 0),
	CONSTRAINT "missao_competition_seconds" CHECK ("missao_saber"."competitions"."problem_seconds" between 20 and 300 and "missao_saber"."competitions"."challenge_seconds" between 60 and 900)
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"profile_id" uuid,
	"seat" integer NOT NULL,
	"nickname" text NOT NULL,
	"avatar" text NOT NULL,
	"grade" integer NOT NULL,
	"level" text NOT NULL,
	"band" text NOT NULL,
	CONSTRAINT "missao_competitor_grade" CHECK ("missao_saber"."competitors"."grade" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "missao_saber"."puzzle_solves" (
	"profile_id" uuid NOT NULL,
	"puzzle_id" text NOT NULL,
	"solves" integer DEFAULT 1 NOT NULL,
	"best_seconds" integer NOT NULL,
	"first_solved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_solved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "puzzle_solves_profile_id_puzzle_id_pk" PRIMARY KEY("profile_id","puzzle_id"),
	CONSTRAINT "missao_puzzle_solve_counts" CHECK ("missao_saber"."puzzle_solves"."solves" > 0 and "missao_saber"."puzzle_solves"."best_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "missao_saber"."competition_turns" ADD CONSTRAINT "competition_turns_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "missao_saber"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."competition_turns" ADD CONSTRAINT "competition_turns_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "missao_saber"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."competitions" ADD CONSTRAINT "competitions_user_id_families_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "missao_saber"."families"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."competitors" ADD CONSTRAINT "competitors_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "missao_saber"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."competitors" ADD CONSTRAINT "competitors_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missao_saber"."puzzle_solves" ADD CONSTRAINT "puzzle_solves_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "missao_saber"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "missao_competition_turn_position" ON "missao_saber"."competition_turns" USING btree ("competition_id","position");--> statement-breakpoint
CREATE INDEX "missao_competition_turn_competitor" ON "missao_saber"."competition_turns" USING btree ("competitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "missao_competition_request" ON "missao_saber"."competitions" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "missao_competitions_owner" ON "missao_saber"."competitions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missao_competitor_seat" ON "missao_saber"."competitors" USING btree ("competition_id","seat");