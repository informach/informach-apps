import "server-only";
import type { FamilyTransaction } from "@informach/family";
import { assertAllowed } from "@/lib/errors";
import { estrelaAccessInTransaction } from "../billing/access-repository";
import type { EstrelaAuthority, ParentAuthority } from "./authority";
import { enabledChildIds } from "./child-repository";
import { lockChildAccess } from "./scope";

export function assertParent(actor: EstrelaAuthority): asserts actor is ParentAuthority {
  assertAllowed(
    actor.kind === "adult" || actor.kind === "pin",
    "PARENT",
    "Abra a área dos pais para fazer isso.",
  );
}
/** Plan and permission are rechecked after the same family lock used for revocation/billing. */
export async function lockChildUse(
  tx: FamilyTransaction,
  actor: EstrelaAuthority,
  childIds: string[],
) {
  await lockChildAccess(tx, actor, childIds, "write");
  const access = await estrelaAccessInTransaction(tx, actor);
  const enabled = new Set(await enabledChildIds(tx, actor, access.childLimit));
  assertAllowed(
    childIds.every((id) => enabled.has(id)),
    "PLAN",
    "Essa criança está fora do acesso atual. Confira em Ajustes.",
  );
  return access;
}
