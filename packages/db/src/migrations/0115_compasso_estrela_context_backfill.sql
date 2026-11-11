-- Writer cutover: preserve native device IDs, hashes and deadlines. Never mint grants.
LOCK TABLE dia_de_estrela.families, dia_de_estrela.rewards, dia_de_estrela.devices, dia_de_estrela.device_children,
  dia_de_estrela.pairing_codes, dia_de_estrela.children, family.app_profiles,
  family.access_grants, family.groups, family.group_people, family.people,
  family.members, core.users IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE dia_de_estrela.families f SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE s.app = 'dia-de-estrela' AND s.source_owner_id = f.user_id AND f.family_group_id IS NULL;
--> statement-breakpoint
UPDATE dia_de_estrela.rewards r SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE s.app = 'dia-de-estrela' AND s.source_owner_id = r.user_id AND r.family_group_id IS NULL;
--> statement-breakpoint
UPDATE dia_de_estrela.devices d SET family_group_id = s.group_id
FROM family.migration_sources s
WHERE s.app = 'dia-de-estrela' AND s.source_owner_id = d.user_id AND d.family_group_id IS NULL;
--> statement-breakpoint
-- Every household object must retain its recorded origin, including inactive records.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT user_id, family_group_id FROM dia_de_estrela.families
      UNION ALL SELECT user_id, family_group_id FROM dia_de_estrela.rewards
      UNION ALL SELECT user_id, family_group_id FROM dia_de_estrela.devices
    ) item LEFT JOIN family.migration_sources s
      ON s.app = 'dia-de-estrela' AND s.source_owner_id = item.user_id
    WHERE s.group_id IS NULL OR item.family_group_id IS DISTINCT FROM s.group_id
  ) OR EXISTS (
    SELECT 1 FROM dia_de_estrela.children c
    LEFT JOIN family.app_profiles a ON a.id = c.family_profile_id
    LEFT JOIN family.migration_sources s ON s.app = 'dia-de-estrela' AND s.source_owner_id = c.user_id
    WHERE a.id IS NULL OR a.app <> 'dia-de-estrela' OR a.group_id IS DISTINCT FROM s.group_id
      OR a.source_key IS DISTINCT FROM c.id::text
  ) THEN RAISE EXCEPTION 'Compasso Estrela: inconsistent household provenance'; END IF;
END $$;
--> statement-breakpoint
-- A live credential with an unproven or conflicting origin needs explicit investigation.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM dia_de_estrela.devices WHERE family_group_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM dia_de_estrela.device_children g
      JOIN dia_de_estrela.devices d ON d.id = g.device_id
      JOIN dia_de_estrela.children p ON p.id = g.child_id
      LEFT JOIN family.app_profiles a ON a.id = p.family_profile_id
      WHERE d.revoked_at IS NULL AND d.expires_at > statement_timestamp()
        AND (a.id IS NULL OR a.app <> 'dia-de-estrela' OR a.group_id <> d.family_group_id
          OR a.source_key IS DISTINCT FROM p.id::text OR p.user_id <> d.user_id)
    ) THEN RAISE EXCEPTION 'Compasso Estrela devices: inconsistent activation provenance'; END IF;
END $$;
--> statement-breakpoint
UPDATE dia_de_estrela.device_children g
SET delegation_key = a.delegation_key, read_grant_id = r.id, write_grant_id = w.id
FROM dia_de_estrela.devices d
JOIN dia_de_estrela.children p ON p.user_id = d.user_id
JOIN family.app_profiles a ON a.id = p.family_profile_id AND a.group_id = d.family_group_id
  AND a.app = 'dia-de-estrela'
JOIN family.groups fg ON fg.id = a.group_id
JOIN family.group_people gp ON gp.group_id = a.group_id AND gp.person_id = a.person_id
JOIN family.people person ON person.id = a.person_id
JOIN family.members m ON m.group_id = a.group_id AND m.user_id = d.user_id
JOIN core.users u ON u.id = d.user_id
JOIN family.access_grants r ON r.profile_id = a.id AND r.group_id = a.group_id
  AND r.user_id = d.user_id AND r.action = 'read'
JOIN family.access_grants w ON w.profile_id = a.id AND w.group_id = a.group_id
  AND w.user_id = d.user_id AND w.action = 'write'
WHERE g.device_id = d.id AND g.child_id = p.id AND g.delegation_key IS NULL
  AND a.archived_at IS NULL AND fg.archived_at IS NULL AND gp.archived_at IS NULL
  AND person.archived_at IS NULL AND m.revoked_at IS NULL AND u.email_verified = true
  AND (u.banned = false OR u.ban_expires_at <= statement_timestamp());
--> statement-breakpoint
-- Withdraw obsolete operational capabilities only; all routine and reward history stays untouched.
DELETE FROM dia_de_estrela.device_children
WHERE delegation_key IS NULL OR read_grant_id IS NULL OR write_grant_id IS NULL;
--> statement-breakpoint
UPDATE dia_de_estrela.devices d SET revoked_at = statement_timestamp()
WHERE d.revoked_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM dia_de_estrela.device_children g WHERE g.device_id = d.id);
