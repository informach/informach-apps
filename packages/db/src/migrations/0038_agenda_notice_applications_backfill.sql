-- Preserve per-child idempotency for documents confirmed before applications
-- became explicit. Original scopes remain NULL until reviewed by the family.
INSERT INTO "agenda"."notice_applications" ("notice_id", "profile_id")
SELECT DISTINCT a."notice_id", a."profile_id"
FROM "agenda"."notice_actions" a
INNER JOIN "agenda"."notices" n ON n."id" = a."notice_id"
WHERE n."status" = 'confirmed'
ON CONFLICT ("notice_id", "profile_id") DO NOTHING;
