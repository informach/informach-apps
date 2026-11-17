import { and, type Database, eq, gt } from "@informach/db";
import {
  accountWebClosures as closures,
  accountWebClosureConsents as consents,
} from "@informach/db/schema";
import { lte } from "drizzle-orm";
import { webClosurePlanSchema } from "./closure-contract";

/** Personal process history without leases, provider errors or app content. */
export async function* exportClosureRecords(
  db: Database,
  actorId: string,
  check: () => Promise<void>,
  startedAt: Date,
) {
  let after: string | undefined;
  while (true) {
    await check();
    const rows = await db
      .select({
        id: closures.id,
        scope: closures.scope,
        state: closures.state,
        planRevision: closures.planRevision,
        createdAt: closures.createdAt,
        confirmedAt: closures.confirmedAt,
        completedAt: closures.completedAt,
      })
      .from(closures)
      .where(
        and(
          eq(closures.actorId, actorId),
          lte(closures.createdAt, startedAt),
          after ? gt(closures.id, after) : undefined,
        ),
      )
      .orderBy(closures.id)
      .limit(50);
    for (const row of rows) {
      await check();
      yield { kind: "account.closure", data: row };
      let revision = 0;
      while (true) {
        await check();
        const records = await db
          .select({
            revision: consents.revision,
            digest: consents.digest,
            plans: consents.plans,
            confirmedAt: consents.confirmedAt,
          })
          .from(consents)
          .innerJoin(closures, eq(closures.id, consents.closureId))
          .where(
            and(
              eq(closures.actorId, actorId),
              eq(consents.closureId, row.id),
              gt(consents.revision, revision),
              lte(consents.confirmedAt, startedAt),
            ),
          )
          .orderBy(consents.revision)
          .limit(50);
        await check();
        if (records.length)
          yield {
            kind: "account.closure_consents",
            data: {
              operationId: row.id,
              records: records.map((record) => ({
                revision: record.revision,
                digest: record.digest,
                confirmedAt: record.confirmedAt,
                plans: record.plans.map(({ domain, plan }) => {
                  const parsed = webClosurePlanSchema.parse(plan);
                  return {
                    domain,
                    version: parsed.version,
                    personalRecords: parsed.personalRecords,
                    sharedRecords: parsed.sharedRecords,
                    credentials: parsed.credentials,
                    blockers: parsed.blockers,
                  };
                }),
              })),
            },
          };
        if (records.length < 50) break;
        const last = records.at(-1);
        if (!last) throw new Error("Closure consent export cursor missing");
        revision = last.revision;
      }
    }
    if (rows.length < 50) break;
    const last = rows.at(-1);
    if (!last) throw new Error("Closure export cursor missing");
    after = last.id;
  }
}
