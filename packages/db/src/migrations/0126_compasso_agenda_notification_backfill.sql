-- Writer cutover: notification consent is scoped to its recorded Agenda households.
-- Drizzle 0.31.11 does not remove inline primary keys; verify the historical key first.
LOCK TABLE agenda.notification_preferences, agenda.family_members, family.migration_sources,
  family.members, family.groups IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$ DECLARE key_name text; key_columns text[];
BEGIN
  SELECT c.conname, array_agg(a.attname::text ORDER BY k.ordinality)
    INTO key_name, key_columns FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.conrelid = 'agenda.notification_preferences'::regclass AND c.contype = 'p'
    GROUP BY c.conname;
  IF key_name IS NOT NULL THEN
    IF key_columns <> ARRAY['user_id']::text[] THEN
      RAISE EXCEPTION 'Unexpected Agenda notification primary key; inspect before cutover';
    END IF;
    EXECUTE format('ALTER TABLE agenda.notification_preferences DROP CONSTRAINT %I', key_name);
  END IF;
END $$;
--> statement-breakpoint
CREATE TEMP TABLE agenda_notification_scope ON COMMIT DROP AS
SELECT DISTINCT p.id AS preference_id, origin.group_id
FROM agenda.notification_preferences p
JOIN family.migration_sources origin ON origin.app = 'agenda-da-turma'
  AND (origin.source_owner_id = p.user_id OR EXISTS (
    SELECT 1 FROM agenda.family_members old
    WHERE old.user_id = p.user_id AND old.owner_user_id = origin.source_owner_id))
JOIN family.members member ON member.group_id = origin.group_id
  AND member.user_id = p.user_id AND member.revoked_at IS NULL
JOIN family.groups g ON g.id = origin.group_id AND g.archived_at IS NULL
WHERE p.family_group_id IS NULL;
--> statement-breakpoint
-- Copies only established consent. No new household receives an automatic opt-in.
INSERT INTO agenda.notification_preferences
  (user_id, family_group_id, email_enabled, push_enabled, digest_hour, quiet_start, quiet_end,
   suggest_reminders, weekly_digest_enabled, weekly_digest_day, weekly_digest_hour, updated_at)
SELECT p.user_id, scope.group_id, p.email_enabled, p.push_enabled, p.digest_hour,
  p.quiet_start, p.quiet_end, p.suggest_reminders, p.weekly_digest_enabled,
  p.weekly_digest_day, p.weekly_digest_hour, p.updated_at
FROM agenda.notification_preferences p JOIN agenda_notification_scope scope ON scope.preference_id = p.id
WHERE NOT EXISTS (SELECT 1 FROM agenda.notification_preferences target
  WHERE target.user_id = p.user_id AND target.family_group_id = scope.group_id);
--> statement-breakpoint
-- Rows without a surviving, proven household are obsolete preferences, not domain history.
DELETE FROM agenda.notification_preferences WHERE family_group_id IS NULL;
