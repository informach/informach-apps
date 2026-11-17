-- Run by the migrator in one transaction during the web-writer cutover.
-- No identity matching by name. Names/history/local IDs are preserved.
-- The completion receipt prevents a replay from resurrecting revoked grants.
LOCK TABLE agenda.student_profiles, agenda.family_members, agenda.family_profile_access,
  bora_treinar.families, bora_treinar.profiles, missao_saber.families, missao_saber.profiles,
  dia_de_estrela.families, dia_de_estrela.children, dia_de_estrela.guardians
  IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TEMP TABLE compasso_sources ON COMMIT DROP AS
WITH sources AS (
  SELECT 'agenda-da-turma'::text AS app, user_id FROM agenda.student_profiles
  UNION SELECT 'agenda-da-turma', user_id FROM agenda.family_settings
  UNION SELECT 'agenda-da-turma', owner_user_id FROM agenda.family_members
  UNION SELECT 'bora-treinar', user_id FROM bora_treinar.families
  UNION SELECT 'missao-saber', user_id FROM missao_saber.families
  UNION SELECT 'dia-de-estrela', user_id FROM dia_de_estrela.families
  UNION SELECT 'cozya', user_id FROM cozya.recipes
  UNION SELECT app, subject_id FROM billing.customers WHERE subject_type = 'user'
    AND app IN ('agenda-da-turma','bora-treinar','missao-saber','dia-de-estrela','cozya')
)
SELECT sources.*, overlay(overlay(md5('compasso:group:' || user_id) placing '8' from 13) placing 'a' from 17)::uuid AS group_id
FROM sources JOIN core.users u ON u.id = sources.user_id
WHERE NOT EXISTS (SELECT 1 FROM family.events WHERE id = '04218270-6ccf-8d32-a527-3fbb512c8382');
--> statement-breakpoint
INSERT INTO family.groups(id, name)
SELECT DISTINCT group_id, 'Minha família' FROM compasso_sources ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.migration_sources(app, source_owner_id, group_id)
SELECT app, user_id, group_id FROM compasso_sources ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.members(group_id, user_id, role)
SELECT DISTINCT group_id, user_id, 'administrator' FROM compasso_sources ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.members(group_id, user_id, role)
SELECT s.group_id, m.user_id, 'member' FROM agenda.family_members m
JOIN compasso_sources s ON s.app = 'agenda-da-turma' AND s.user_id = m.owner_user_id
UNION SELECT s.group_id, m.user_id, 'member' FROM dia_de_estrela.guardians m
JOIN compasso_sources s ON s.app = 'dia-de-estrela' AND s.user_id = m.owner_user_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.people(id, user_id, kind)
SELECT DISTINCT overlay(overlay(md5('compasso:adult:' || m.user_id) placing '8' from 13) placing 'a' from 17)::uuid,
  m.user_id, 'adult'
FROM family.members m WHERE m.group_id IN (SELECT group_id FROM compasso_sources)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.group_people(group_id, person_id)
SELECT m.group_id, p.id FROM family.members m JOIN family.people p ON p.user_id = m.user_id
WHERE m.group_id IN (SELECT group_id FROM compasso_sources) ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TEMP TABLE compasso_profiles ON COMMIT DROP AS
WITH profiles AS (
  SELECT 'agenda-da-turma'::text AS app, id, user_id, name, '#48785C'::text AS color,
    'person'::text AS avatar, 'dependent'::text AS kind, created_at FROM agenda.student_profiles
  UNION ALL SELECT 'bora-treinar', id, user_id, name, color, 'person', 'unclassified', created_at FROM bora_treinar.profiles
  UNION ALL SELECT 'missao-saber', id, user_id, nickname, '#48785C', avatar, 'dependent', created_at FROM missao_saber.profiles
  UNION ALL SELECT 'dia-de-estrela', id, user_id, name, color, 'person', 'dependent', created_at FROM dia_de_estrela.children
)
SELECT p.*, s.group_id,
  overlay(overlay(md5('compasso:person:' || p.app || ':' || p.id::text) placing '8' from 13) placing 'a' from 17)::uuid AS person_id,
  overlay(overlay(md5('compasso:activation:' || p.app || ':' || p.id::text) placing '8' from 13) placing 'a' from 17)::uuid AS activation_id
FROM profiles p JOIN compasso_sources s ON s.app = p.app AND s.user_id = p.user_id;
--> statement-breakpoint
INSERT INTO family.people(id, kind, display_name, color, avatar, created_at, updated_at)
SELECT person_id, kind, name, color, avatar, created_at, created_at FROM compasso_profiles ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.person_managers(person_id, user_id)
SELECT person_id, user_id FROM compasso_profiles ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.group_people(group_id, person_id)
SELECT group_id, person_id FROM compasso_profiles ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.app_profiles(id, group_id, person_id, app, source_key, created_at)
SELECT activation_id, group_id, person_id, app, id::text, created_at FROM compasso_profiles ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO family.access_grants(group_id, profile_id, user_id, action)
SELECT p.group_id, p.activation_id, p.user_id, a.action FROM compasso_profiles p
CROSS JOIN (VALUES ('read'),('write'),('manage'),('use_ai')) a(action) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- A historical Agenda guest gets only the previously authorized children.
INSERT INTO family.access_grants(group_id, profile_id, user_id, action)
SELECT p.group_id, p.activation_id, m.user_id, a.action FROM compasso_profiles p
JOIN agenda.family_profile_access g ON g.profile_id = p.id AND p.app = 'agenda-da-turma'
JOIN agenda.family_members m ON m.id = g.member_id AND m.owner_user_id = p.user_id
CROSS JOIN (VALUES ('read'),('write'),('use_ai')) a(action) ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- A Dia de Estrela guardian keeps care access; never billing or identity administration.
INSERT INTO family.access_grants(group_id, profile_id, user_id, action)
SELECT p.group_id, p.activation_id, m.user_id, a.action FROM compasso_profiles p
JOIN dia_de_estrela.guardians m ON m.owner_user_id = p.user_id AND p.app = 'dia-de-estrela'
CROSS JOIN (VALUES ('read'),('write')) a(action) ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE agenda.student_profiles p SET family_profile_id = m.activation_id FROM compasso_profiles m
WHERE m.app = 'agenda-da-turma' AND m.id = p.id AND p.family_profile_id IS NULL;
--> statement-breakpoint
UPDATE bora_treinar.profiles p SET family_profile_id = m.activation_id FROM compasso_profiles m
WHERE m.app = 'bora-treinar' AND m.id = p.id AND p.family_profile_id IS NULL;
--> statement-breakpoint
UPDATE missao_saber.profiles p SET family_profile_id = m.activation_id FROM compasso_profiles m
WHERE m.app = 'missao-saber' AND m.id = p.id AND p.family_profile_id IS NULL;
--> statement-breakpoint
UPDATE dia_de_estrela.children p SET family_profile_id = m.activation_id FROM compasso_profiles m
WHERE m.app = 'dia-de-estrela' AND m.id = p.id AND p.family_profile_id IS NULL;
--> statement-breakpoint
-- Abort the whole migration on a preexisting inconsistent link; no partial receipt.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM compasso_profiles m JOIN (
      SELECT 'agenda-da-turma'::text AS app, id, family_profile_id FROM agenda.student_profiles
      UNION ALL SELECT 'bora-treinar', id, family_profile_id FROM bora_treinar.profiles
      UNION ALL SELECT 'missao-saber', id, family_profile_id FROM missao_saber.profiles
      UNION ALL SELECT 'dia-de-estrela', id, family_profile_id FROM dia_de_estrela.children
    ) p ON p.app = m.app AND p.id = m.id WHERE p.family_profile_id IS DISTINCT FROM m.activation_id
  ) THEN RAISE EXCEPTION 'Compasso backfill: inconsistent activation provenance'; END IF;
END $$;
--> statement-breakpoint
INSERT INTO family.events(id, event) VALUES ('04218270-6ccf-8d32-a527-3fbb512c8382', 'migration.identity_backfill_completed')
ON CONFLICT DO NOTHING;
