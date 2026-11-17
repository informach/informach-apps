import { inspectSharedIdentityDependencies } from "@informach/auth/identity-dependencies";
import { inspectBillingDeparture } from "@informach/billing/departure";
import type { Database } from "@informach/db";
import { inspectEdiIdentityDependencies } from "@informach/edi-licensing/identity-dependencies";
import { inspectFamilyDeparture } from "@informach/family/departure";

/** Composes the shared obligations for a closure review. The web scope does not
 * authorize deleting the shared login or any independent product. Product-local
 * cleanup assessments and the durable executor are separate required stages. */
export async function* inspectAccountDeparture(input: {
  db: Database;
  actorId: string;
  authorize: () => Promise<void>;
  signal?: AbortSignal;
}) {
  const check = async () => {
    input.signal?.throwIfAborted();
    await input.authorize();
    input.signal?.throwIfAborted();
  };
  await check();
  const identity = await inspectSharedIdentityDependencies(input.db, input.actorId);
  await check();
  yield {
    kind: "account.identity_dependencies" as const,
    scope: "compasso-web" as const,
    data: identity,
  };
  yield* inspectFamilyDeparture(input.db, input.actorId, check);
  yield* inspectBillingDeparture(input.db, input.actorId, check);
  await check();
  const edi = await inspectEdiIdentityDependencies(input.db, input.actorId);
  await check();
  yield { kind: "edi.identity_dependencies" as const, data: edi };
}
