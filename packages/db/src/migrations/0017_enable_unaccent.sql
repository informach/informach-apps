-- Habilita a extensão unaccent (trusted desde PG13) para busca insensível a
-- acentos em queries dos apps. Usada em apps/cozya/src/features/recipes para
-- que "açúcar" e "acucar" casem indistintamente. Idempotente.
CREATE EXTENSION IF NOT EXISTS unaccent;
