-- Preserve each challenge and its history; imported source IDs determine the family.
UPDATE bora_treinar.challenges c
SET family_group_id = fp.group_id
FROM bora_treinar.profiles p JOIN family.app_profiles fp ON fp.id = p.family_profile_id
WHERE c.profile_id = p.id AND c.family_group_id IS NULL;
--> statement-breakpoint
UPDATE bora_treinar.challenges c
SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE c.profile_id IS NULL AND c.family_group_id IS NULL
  AND s.app = 'bora-treinar' AND s.source_owner_id = c.user_id;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM bora_treinar.challenges WHERE family_group_id IS NULL) THEN
    RAISE EXCEPTION 'Bora challenge migration: unresolved family context';
  END IF;
END $$;
