-- Drizzle 0.31.11 cannot emit the removal of the historical inline primary key.
-- Only this unapplied custom migration handles that DDL; 0121 is generated normally.
-- 0058 created user_id as the inline PK. Resolve it from PostgreSQL metadata and
-- verify its exact columns, so an unexpected production constraint aborts safely.
LOCK TABLE agenda.family_settings IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$ DECLARE key_name text; key_columns text[];
BEGIN
  SELECT c.conname, array_agg(a.attname::text ORDER BY k.ordinality)
    INTO key_name, key_columns
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.conrelid = 'agenda.family_settings'::regclass AND c.contype = 'p'
    GROUP BY c.conname;
  IF key_name IS NOT NULL THEN
    IF key_columns <> ARRAY['user_id']::text[] THEN
      RAISE EXCEPTION 'Unexpected Agenda settings primary key; inspect before cutover';
    END IF;
    EXECUTE format('ALTER TABLE agenda.family_settings DROP CONSTRAINT %I', key_name);
  END IF;
END $$;
