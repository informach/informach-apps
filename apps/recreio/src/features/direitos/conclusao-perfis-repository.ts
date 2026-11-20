import "server-only";
import { and, eq, inArray, sql } from "@informach/db";
import {
  type recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";

/** Parent operation is locked. Shared by withdrawal and account closure;
 * a retained identifier is neither erased nor represented as anonymous. */
export async function conferirPerfisMinimizados(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  alvos: readonly (typeof subjects.$inferSelect)[],
) {
  const retidos = alvos.filter((s) => s.phase === "minimized" || s.phase === "purging");
  const ids = retidos.map((s) => s.profileReference);
  const cadastros = ids.length
    ? await tx
        .select()
        .from(profiles)
        .where(inArray(profiles.id, ids))
        .orderBy(profiles.id)
        .for("share")
    : [];
  assertAllowed(
    alvos.every(
      (s) =>
        s.retentionPolicyVersion === "perfil-2026-11-19" &&
        s.minimizedAt !== null &&
        ((s.phase === "removed" && s.liveProfileId === null && s.completedAt !== null) ||
          ((s.phase === "minimized" || s.phase === "purging") &&
            s.liveProfileId === s.profileReference &&
            s.completedAt === null &&
            cadastros.some(
              (p) =>
                p.id === s.profileReference &&
                p.rightsOperationId === op.id &&
                p.status === "suspended" &&
                p.rightsFrozenState !== null &&
                p.userId === null &&
                p.groupId === null &&
                !p.coverageEnabled &&
                p.nickname === "Perfil retirado" &&
                p.avatar === "padrao",
            ))),
    ),
    "DIREITOS_INTEGRIDADE",
    "Os sujeitos ainda não têm recibo de retirada.",
  );
  return retidos;
}

export async function conferirConclusaoDosPerfis(
  tx: Transacao,
  op: typeof operations.$inferSelect,
  alvos: readonly (typeof subjects.$inferSelect)[],
) {
  const retidos = await conferirPerfisMinimizados(tx, op, alvos);
  assertAllowed(
    alvos.every((s) => s.phase !== "purging"),
    "DIREITOS_INTEGRIDADE",
    "O expurgo das referências ainda precisa terminar.",
  );
  const passos = await tx.select().from(worlds).where(eq(worlds.operationId, op.id));
  assertAllowed(
    passos.every((p) => p.phase === "completed" && p.completedAt !== null),
    "DIREITOS_INTEGRIDADE",
    "Os mundos ainda não foram liberados.",
  );
  await conferirPrazosDaConclusao(tx, op.id);
  return retidos;
}

/** Repeat after strict audit: a retention can expire during an awaited write. */
export async function conferirPrazosDaConclusao(tx: Transacao, operacaoId: string) {
  const vencidos = await tx
    .select({ id: subjects.profileReference })
    .from(subjects)
    .where(
      and(
        eq(subjects.operationId, operacaoId),
        eq(subjects.phase, "minimized"),
        sql`${subjects.retainedUntil}<=${AGORA}`,
      ),
    )
    .limit(1);
  assertAllowed(
    vencidos.length === 0,
    "DIREITOS_INTEGRIDADE",
    "Uma retenção venceu durante a conclusão.",
  );
}
