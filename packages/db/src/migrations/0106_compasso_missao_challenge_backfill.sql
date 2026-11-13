-- Historical ownership is evidence of origin, never a name-based association.
LOCK TABLE missao_saber.family_challenges, family.migration_sources IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM missao_saber.family_challenges c
    LEFT JOIN family.migration_sources s ON s.app = 'missao-saber' AND s.source_owner_id = c.user_id
    WHERE s.group_id IS NULL OR (c.family_group_id IS NOT NULL AND c.family_group_id <> s.group_id)
  ) THEN RAISE EXCEPTION 'Missao challenge migration: unresolved or conflicting provenance'; END IF;
END $$;
--> statement-breakpoint
UPDATE missao_saber.family_challenges c
SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE c.family_group_id IS NULL AND s.app = 'missao-saber' AND s.source_owner_id = c.user_id;
