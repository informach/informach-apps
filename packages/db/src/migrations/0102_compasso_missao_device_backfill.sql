-- Writer cutover: preserve native device IDs, hashes and deadlines. Never mint grants.
LOCK TABLE missao_saber.study_devices, missao_saber.study_device_profiles,
  missao_saber.study_codes, missao_saber.profiles, family.app_profiles,
  family.access_grants, family.groups, family.group_people, family.people,
  family.members, core.users IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE missao_saber.study_devices d SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE s.app = 'missao-saber' AND s.source_owner_id = d.user_id AND d.family_group_id IS NULL;
--> statement-breakpoint
-- A live credential with an unproven or conflicting origin needs explicit investigation.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM missao_saber.study_devices WHERE family_group_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM missao_saber.study_device_profiles g
      JOIN missao_saber.study_devices d ON d.id = g.device_id
      JOIN missao_saber.profiles p ON p.id = g.profile_id
      LEFT JOIN family.app_profiles a ON a.id = p.family_profile_id
      WHERE d.revoked_at IS NULL AND d.expires_at > statement_timestamp()
        AND (a.id IS NULL OR a.app <> 'missao-saber' OR a.group_id <> d.family_group_id
          OR a.source_key IS DISTINCT FROM p.id::text OR p.user_id <> d.user_id)
    ) THEN RAISE EXCEPTION 'Compasso study devices: inconsistent activation provenance'; END IF;
END $$;
--> statement-breakpoint
UPDATE missao_saber.study_device_profiles g
SET delegation_key = a.delegation_key, read_grant_id = r.id, write_grant_id = w.id
FROM missao_saber.study_devices d
JOIN missao_saber.profiles p ON p.user_id = d.user_id
JOIN family.app_profiles a ON a.id = p.family_profile_id AND a.group_id = d.family_group_id
  AND a.app = 'missao-saber'
JOIN family.groups fg ON fg.id = a.group_id
JOIN family.group_people gp ON gp.group_id = a.group_id AND gp.person_id = a.person_id
JOIN family.people person ON person.id = a.person_id
JOIN family.members m ON m.group_id = a.group_id AND m.user_id = d.user_id
JOIN core.users u ON u.id = d.user_id
JOIN family.access_grants r ON r.profile_id = a.id AND r.group_id = a.group_id
  AND r.user_id = d.user_id AND r.action = 'read'
JOIN family.access_grants w ON w.profile_id = a.id AND w.group_id = a.group_id
  AND w.user_id = d.user_id AND w.action = 'write'
WHERE g.device_id = d.id AND g.profile_id = p.id AND g.delegation_key IS NULL
  AND a.archived_at IS NULL AND fg.archived_at IS NULL AND gp.archived_at IS NULL
  AND person.archived_at IS NULL AND m.revoked_at IS NULL AND u.email_verified = true
  AND (u.banned = false OR u.ban_expires_at <= statement_timestamp());
--> statement-breakpoint
-- Withdraw obsolete operational capabilities only; all pedagogical history stays untouched.
DELETE FROM missao_saber.study_device_profiles
WHERE delegation_key IS NULL OR read_grant_id IS NULL OR write_grant_id IS NULL;
--> statement-breakpoint
UPDATE missao_saber.study_devices d SET revoked_at = statement_timestamp()
WHERE d.revoked_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM missao_saber.study_device_profiles g WHERE g.device_id = d.id);
