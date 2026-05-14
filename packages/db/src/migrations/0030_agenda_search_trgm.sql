-- pg_trgm + agenda.unaccent_immutable + GIN trigram indexes para os
-- comboboxes de cadastro manual de turma (`/api/data/schools`, `/cities`).
--
-- Sem isto, `searchSchoolsInCity` (181k rows INEP) e `searchCitiesInState`
-- (~5570 rows IBGE) fazem `unaccent(name) ILIKE pattern` por seq-scan. Com o
-- GIN trigram cobrindo a expressão `agenda.unaccent_immutable(name)`, o
-- planner usa Bitmap Index Scan e devolve em ms mesmo com pattern parcial.
--
-- `unaccent_immutable` é necessário porque o `public.unaccent(text)` upstream
-- não é declarado IMMUTABLE (a sobrecarga 2-arg consulta dicionários FTS).
-- GIN expression index exige IMMUTABLE → wrapper SQL em torno da forma
-- `unaccent('public.unaccent'::regdictionary, text)` resolve.
--
-- Espelha o pattern usado em cozya migration 0019 (recipes search). Idempotente
-- via IF NOT EXISTS / CREATE OR REPLACE.

CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "agenda"."unaccent_immutable"(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, input)
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_schools_name_unaccent_trgm_idx"
  ON "agenda"."schools" USING gin (agenda.unaccent_immutable("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_cities_name_unaccent_trgm_idx"
  ON "agenda"."cities" USING gin (agenda.unaccent_immutable("name") gin_trgm_ops);
