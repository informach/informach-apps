ALTER TABLE "agenda"."subjects" ADD COLUMN "color_index" smallint DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Backfill: distribui cores 1..5 por turma, em ordem de criação.
-- Não tenta honrar o mapa curado (Matemática=1 etc.) pra rows existentes —
-- novas inserções já passam pelo algoritmo curado-se-livre no repository.
WITH ranked AS (
  SELECT id,
         (((ROW_NUMBER() OVER (PARTITION BY turma_id ORDER BY created_at, id)) - 1) % 5) + 1 AS idx
  FROM "agenda"."subjects"
)
UPDATE "agenda"."subjects" s
SET "color_index" = ranked.idx
FROM ranked
WHERE s.id = ranked.id;
