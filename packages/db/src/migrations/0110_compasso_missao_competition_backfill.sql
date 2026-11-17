-- Preserve events, participants and results. Resolve family strictly from imported provenance.
LOCK TABLE missao_saber.competitions, missao_saber.competitors, missao_saber.profiles, family.app_profiles, family.migration_sources IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM missao_saber.competitions c
    LEFT JOIN family.migration_sources s ON s.app = 'missao-saber' AND s.source_owner_id = c.user_id
    WHERE s.group_id IS NULL OR (c.family_group_id IS NOT NULL AND c.family_group_id <> s.group_id)
  ) THEN RAISE EXCEPTION 'Missao competition migration: unresolved family provenance'; END IF;
  IF EXISTS (
    SELECT 1 FROM missao_saber.competitors participant
    JOIN missao_saber.competitions c ON c.id = participant.competition_id
    JOIN family.migration_sources s ON s.app = 'missao-saber' AND s.source_owner_id = c.user_id
    LEFT JOIN missao_saber.profiles p ON p.id = participant.profile_id
    LEFT JOIN family.app_profiles fp ON fp.id = p.family_profile_id
    WHERE participant.profile_id IS NOT NULL AND (fp.id IS NULL OR fp.app <> 'missao-saber' OR fp.group_id <> s.group_id)
  ) THEN RAISE EXCEPTION 'Missao competition migration: conflicting participant provenance'; END IF;
END $$;
--> statement-breakpoint
UPDATE missao_saber.competitions c SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE c.family_group_id IS NULL AND s.app = 'missao-saber' AND s.source_owner_id = c.user_id;
