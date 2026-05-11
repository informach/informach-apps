-- Simplifica enum de status de atividades pra ("pending", "done"). O TS
-- enum no schema Drizzle deixou de aceitar "in_progress" (não há DDL pra
-- gerar — text enum só restringe tipo). Backfill: qualquer row pré-existente
-- com status="in_progress" cai pra "pending" (mais conservador: estado de
-- "fazendo" volta pra "não terminei").
UPDATE "agenda"."activity_statuses"
SET "status" = 'pending', "updated_at" = now()
WHERE "status" = 'in_progress';
