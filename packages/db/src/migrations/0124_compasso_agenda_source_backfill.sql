-- Preserve the previous explicit sharing choice; private originals remain private.
UPDATE agenda.notices SET shared_within_family = true
WHERE status = 'confirmed' AND jsonb_array_length(coalesce(source_profile_ids, '[]'::jsonb)) > 0;
--> statement-breakpoint
-- Historical private originals have no reviewed child scope. Restrict their
-- author to all profiles of the recorded household, never guess identity from names.
UPDATE agenda.notices n SET source_profile_ids = (
  SELECT jsonb_agg(p.id::text ORDER BY p.id)
  FROM agenda.student_profiles p JOIN family.app_profiles fp ON fp.id = p.family_profile_id
  WHERE fp.group_id = n.family_group_id AND fp.app = 'agenda-da-turma'
)
WHERE n.status = 'confirmed' AND n.family_group_id IS NOT NULL
  AND jsonb_array_length(coalesce(n.source_profile_ids, '[]'::jsonb)) = 0;
