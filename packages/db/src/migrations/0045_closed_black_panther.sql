ALTER TABLE "missao_saber"."attempts" ALTER COLUMN "correct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."attempts" ADD COLUMN "result" text;