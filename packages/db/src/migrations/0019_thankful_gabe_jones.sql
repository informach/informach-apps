CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "cozya"."unaccent_immutable"(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, input)
$$;--> statement-breakpoint
CREATE INDEX "cozya_recipes_name_unaccent_trgm_idx" ON "cozya"."recipes" USING gin (cozya.unaccent_immutable("name") gin_trgm_ops);
