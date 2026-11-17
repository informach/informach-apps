-- Writer cutover. Identity/permission provenance was recorded by 0082.
-- This migration binds domain history and capabilities; it never grants access.
LOCK TABLE agenda.student_profiles, agenda.notices, agenda.activities,
  agenda.activity_acceptances, agenda.turma_members, agenda.family_settings,
  agenda.calendar_feeds, agenda.calendar_feed_profiles, agenda.idempotent_writes,
  agenda.family_members, agenda.family_profile_access, family.app_profiles,
  family.migration_sources, family.access_grants, family.members, family.groups,
  family.people, family.group_people, core.users IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE agenda.family_settings s SET family_group_id = m.group_id
FROM family.migration_sources m
WHERE m.app = 'agenda-da-turma' AND m.source_owner_id = s.user_id AND s.family_group_id IS NULL;
--> statement-breakpoint
UPDATE agenda.notices n SET family_group_id = m.group_id
FROM family.migration_sources m
WHERE m.app = 'agenda-da-turma' AND m.source_owner_id = n.owner_user_id AND n.family_group_id IS NULL;
--> statement-breakpoint
UPDATE agenda.activities a SET family_group_id = m.group_id
FROM family.migration_sources m
WHERE m.app = 'agenda-da-turma' AND m.source_owner_id = a.created_by_user_id AND a.family_group_id IS NULL;
--> statement-breakpoint
UPDATE agenda.activity_acceptances a SET family_group_id = m.group_id
FROM family.migration_sources m
WHERE m.app = 'agenda-da-turma' AND m.source_owner_id = a.user_id AND a.family_group_id IS NULL;
--> statement-breakpoint
UPDATE agenda.turma_members m SET enrolled_by_user_id = p.user_id
FROM agenda.student_profiles p WHERE p.id = m.student_profile_id AND m.enrolled_by_user_id IS NULL;
--> statement-breakpoint
UPDATE agenda.idempotent_writes w SET family_group_id = m.group_id
FROM family.migration_sources m
WHERE m.app = 'agenda-da-turma' AND m.source_owner_id = w.user_id AND w.family_group_id IS NULL;
--> statement-breakpoint
-- A receipt without a surviving task or proven household cannot authorize a replay.
-- Removing it cannot recreate the task: the mutation requires an existing, granted task.
DELETE FROM agenda.idempotent_writes w
WHERE w.family_group_id IS NULL AND NOT EXISTS (SELECT 1 FROM agenda.tasks t WHERE t.id = w.task_id);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM agenda.family_settings WHERE family_group_id IS NULL)
    OR EXISTS (SELECT 1 FROM agenda.notices WHERE family_group_id IS NULL)
    OR EXISTS (SELECT 1 FROM agenda.activity_acceptances WHERE family_group_id IS NULL)
    OR EXISTS (SELECT 1 FROM agenda.idempotent_writes WHERE family_group_id IS NULL)
    OR EXISTS (SELECT 1 FROM agenda.activities WHERE created_by_user_id IS NOT NULL AND family_group_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM agenda.student_profiles p
      LEFT JOIN family.app_profiles a ON a.id = p.family_profile_id
      LEFT JOIN family.migration_sources s ON s.app = 'agenda-da-turma' AND s.source_owner_id = p.user_id
      WHERE a.id IS NULL OR a.app <> 'agenda-da-turma' OR a.group_id IS DISTINCT FROM s.group_id
        OR a.source_key IS DISTINCT FROM p.id::text
    ) OR EXISTS (
      SELECT 1 FROM agenda.notices n JOIN agenda.student_profiles p ON p.id = n.capture_profile_id
      JOIN family.app_profiles a ON a.id = p.family_profile_id
      WHERE a.group_id IS DISTINCT FROM n.family_group_id
    ) THEN RAISE EXCEPTION 'Compasso Agenda: inconsistent domain provenance'; END IF;
END $$;
--> statement-breakpoint
-- Old feeds included all currently readable children. Capture that exact intersection
-- of legacy and canonical grants, including several historical households if needed.
INSERT INTO agenda.calendar_feed_profiles(feed_id, profile_id, group_id, read_grant_id, activation_generation)
SELECT f.id, a.id, a.group_id, r.id, a.delegation_key
FROM agenda.calendar_feeds f
JOIN agenda.student_profiles p ON p.user_id = f.user_id OR EXISTS (
  SELECT 1 FROM agenda.family_profile_access pa
  JOIN agenda.family_members fm ON fm.id = pa.member_id
  WHERE pa.profile_id = p.id AND fm.user_id = f.user_id AND fm.owner_user_id = p.user_id
)
JOIN family.app_profiles a ON a.id = p.family_profile_id AND a.app = 'agenda-da-turma'
JOIN family.groups g ON g.id = a.group_id
JOIN family.people person ON person.id = a.person_id
JOIN family.group_people gp ON gp.person_id = a.person_id AND gp.group_id = a.group_id
JOIN family.members m ON m.group_id = a.group_id AND m.user_id = f.user_id
JOIN core.users u ON u.id = f.user_id
JOIN family.access_grants r ON r.profile_id = a.id AND r.group_id = a.group_id
  AND r.user_id = f.user_id AND r.action = 'read'
WHERE f.revoked_at IS NULL AND a.archived_at IS NULL AND g.archived_at IS NULL
  AND person.archived_at IS NULL AND gp.archived_at IS NULL AND m.revoked_at IS NULL
  AND u.email_verified = true AND (u.banned = false OR u.ban_expires_at <= statement_timestamp())
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- A one-household legacy feed can also be managed in its matching context.
UPDATE agenda.calendar_feeds f SET family_group_id = scope.group_id
FROM (SELECT feed_id, min(group_id::text)::uuid AS group_id FROM agenda.calendar_feed_profiles
      GROUP BY feed_id HAVING count(DISTINCT group_id) = 1) scope
WHERE f.id = scope.feed_id AND f.family_group_id IS NULL;
--> statement-breakpoint
UPDATE agenda.calendar_feeds f SET revoked_at = statement_timestamp()
WHERE f.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM agenda.calendar_feed_profiles p WHERE p.feed_id = f.id);
