import { readWebParticipation } from "@informach/auth/web-participation";
import { getCompassoAccess } from "@informach/billing/compasso";
import { getCompassoWalletHistory } from "@informach/billing/compasso-account";
import { listLegacyCreditWallets } from "@informach/billing/credit-migration";
import { exportPersonalBillingRecords } from "@informach/billing/privacy";
import { and, type Database, eq, or, sql } from "@informach/db";
import { users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { exportClosureRecords } from "./closure-privacy";

/** Streams currently authorized shared-account data. App-domain content remains
 * with each app's own export and permission rules; billing exposes only payer
 * records, while household statements keep their privacy-safe projection. */
export async function* exportAccountRecords({
  db,
  actorId,
  authorize,
  signal,
  startedAt = new Date(),
}: {
  db: Database;
  actorId: string;
  /** Must revalidate the same authenticated central session, including freshness. */
  authorize: () => Promise<void>;
  signal?: AbortSignal;
  startedAt?: Date;
}) {
  const family = createFamilyService({ db });
  async function check() {
    signal?.throwIfAborted();
    await authorize();
    signal?.throwIfAborted();
  }
  await check();
  const [identity] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      authenticatorEnabled: users.webTwoFactorEnabled,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(
      and(
        eq(users.id, actorId),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= now()`),
      ),
    );
  if (!identity) throw new Error("Export account is unavailable");
  await check();
  yield { kind: "account.identity", data: identity };
  const participation = await readWebParticipation(db, actorId);
  await check();
  yield { kind: "account.web_participation", data: participation };
  let beforeGroup: string | undefined;
  while (true) {
    await check();
    const page = await family.listGroupsPage(actorId, beforeGroup);
    for (const group of page.groups) {
      await check();
      const management = await family.familyManagement(actorId, group.id);
      const coverage = await getCompassoAccess(db, actorId, group.id);
      await check();
      yield { kind: "family.current_access", data: { group, management, coverage } };
      let beforeEntry: number | undefined;
      while (true) {
        await check();
        const history = await getCompassoWalletHistory(db, actorId, group.id, beforeEntry);
        await check();
        yield {
          kind: "family.credit_statement",
          data: { groupId: group.id, entries: history.entries, underReview: history.underReview },
        };
        if (history.nextCursor === null) break;
        beforeEntry = history.nextCursor;
      }
    }
    if (page.nextCursor === null) break;
    beforeGroup = page.nextCursor;
  }
  await check();
  const sources = await listLegacyCreditWallets(db, actorId);
  await check();
  yield { kind: "account.credit_origins", data: sources };
  for await (const chunk of exportPersonalBillingRecords(db, actorId, startedAt)) {
    await check();
    yield chunk;
  }
  yield* exportClosureRecords(db, actorId, check, startedAt);
  await check();
}

/** A complete JSON document is sealed only after every authorization and page
 * succeeded. Cancellation or revocation leaves no misleading completion marker. */
export async function* accountExportJson(
  input: Parameters<typeof exportAccountRecords>[0],
  onComplete?: () => Promise<void>,
) {
  const startedAt = input.startedAt ?? new Date();
  const encode = (value: string) => new TextEncoder().encode(value);
  const records = exportAccountRecords({ ...input, startedAt });
  let count = 0;
  try {
    // Validate before emitting even the document header.
    const first = await records.next();
    yield encode(
      `{"schemaVersion":1,"scope":"shared-account-and-compasso","applicationContents":false,"startedAt":${JSON.stringify(startedAt)},"records":[\n`,
    );
    if (!first.done) {
      input.signal?.throwIfAborted();
      await input.authorize();
      yield encode(JSON.stringify(first.value));
      count++;
    }
    for await (const record of records) {
      yield encode(`${count ? ",\n" : ""}${JSON.stringify(record)}`);
      count++;
    }
    await onComplete?.();
    input.signal?.throwIfAborted();
    yield encode(`\n],"recordCount":${count},"completedAt":${JSON.stringify(new Date())}}\n`);
  } finally {
    await records.return();
  }
}
