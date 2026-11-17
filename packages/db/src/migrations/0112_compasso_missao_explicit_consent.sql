ALTER TABLE "missao_saber"."families" ALTER COLUMN "consent_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ALTER COLUMN "consent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "missao_saber"."families" ALTER COLUMN "consent_at" DROP NOT NULL;