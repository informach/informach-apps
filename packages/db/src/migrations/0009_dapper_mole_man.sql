DROP INDEX "core"."rate_limit_key_idx";--> statement-breakpoint
DELETE FROM "core"."rate_limit" AS stale
USING (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "key"
			ORDER BY "last_request" DESC NULLS LAST, "count" DESC, "id" DESC
		) AS rn
	FROM "core"."rate_limit"
) AS ranked
WHERE stale."id" = ranked."id" AND ranked.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_idx" ON "core"."rate_limit" USING btree ("key");
