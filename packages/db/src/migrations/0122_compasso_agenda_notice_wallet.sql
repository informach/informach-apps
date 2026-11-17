DROP INDEX "agenda"."agenda_notices_owner_hash_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_notices_family_hash_idx" ON "agenda"."notices" USING btree ("family_group_id","content_hash");