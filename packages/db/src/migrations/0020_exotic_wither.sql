-- Adiciona coluna `app` em billing.customers e billing.credit_ledger para
-- isolar billing entre apps que compartilham o mesmo subject (ex.: mesmo
-- user em Cozya e Agenda da Turma → 2 customers Stripe distintos).
--
-- Sequência segura: ADD nullable → backfill (cozya é o único app com dados
-- históricos) → SET NOT NULL → drop UNIQUE/index antigos → criar novos.

-- 1. Adicionar colunas nullable (não falha em rows existentes).
ALTER TABLE "billing"."customers" ADD COLUMN "app" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ADD COLUMN "app" text;--> statement-breakpoint

-- 2. Backfill: todo dado pré-existente pertence à Cozya.
UPDATE "billing"."customers" SET "app" = 'cozya' WHERE "app" IS NULL;--> statement-breakpoint
UPDATE "billing"."credit_ledger" SET "app" = 'cozya' WHERE "app" IS NULL;--> statement-breakpoint

-- 3. Travar NOT NULL após backfill.
ALTER TABLE "billing"."customers" ALTER COLUMN "app" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."credit_ledger" ALTER COLUMN "app" SET NOT NULL;--> statement-breakpoint

-- 4. Substituir UNIQUE/índices que precisam incluir app na chave.
DROP INDEX "billing"."credit_ledger_owner_created_idx";--> statement-breakpoint
DROP INDEX "billing"."credit_ledger_owner_expires_idx";--> statement-breakpoint
DROP INDEX "billing"."customers_provider_subject_uniq";--> statement-breakpoint
DROP INDEX "billing"."customers_subject_idx";--> statement-breakpoint

CREATE INDEX "credit_ledger_owner_app_created_idx" ON "billing"."credit_ledger" USING btree ("owner_type","owner_id","app","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_owner_app_expires_idx" ON "billing"."credit_ledger" USING btree ("owner_type","owner_id","app","expires_at") WHERE "billing"."credit_ledger"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_provider_subject_app_uniq" ON "billing"."customers" USING btree ("provider","subject_type","subject_id","app");--> statement-breakpoint
CREATE INDEX "customers_subject_app_idx" ON "billing"."customers" USING btree ("subject_type","subject_id","app");
