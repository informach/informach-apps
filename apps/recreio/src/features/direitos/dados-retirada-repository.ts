import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioGuardianLinks as guardians,
  recreioProfileDataKeys as keys,
  recreioProfiles as profiles,
  recreioRightsSubjects as subjects,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { ContaIdSchema } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { type CoordenacaoDeEfeitos, comEfeitoNativoDeDireitos } from "./efeitos-repository";

/** Conteúdo pessoal opaco, não fotografias ou histórico dos demais jogadores.
 * Apaga no máximo 100 linhas por passagem e não carrega o BLOB para o processo.
 * Perfis permanecem sob a barreira; sua minimização tem recibo/etapa próprios. */
export function retirarProximosDadosPessoais(config: CoordenacaoDeEfeitos) {
  return comEfeitoNativoDeDireitos(config, "dados", async (tx, op) => {
    await serializarContaNativa(tx, ContaIdSchema.parse(op.requesterUserId));
    const alvos = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.operationId, op.id), eq(subjects.phase, "selected")))
      .orderBy(subjects.profileReference);
    const ids = alvos.map((p) => p.profileReference);
    assertAllowed(
      ids.length > 0 && ids.length <= 256,
      "DIREITOS_INTEGRIDADE",
      "Seleção pessoal inconsistente.",
    );
    const perfis = await tx
      .select()
      .from(profiles)
      .where(inArray(profiles.id, ids))
      .orderBy(profiles.id)
      .for("update");
    const vinculos = await tx
      .select()
      .from(guardians)
      .where(inArray(guardians.profileId, ids))
      .orderBy(guardians.profileId)
      .for("share");
    assertAllowed(
      perfis.length === ids.length &&
        perfis.every(
          (p) =>
            p.rightsOperationId === op.id &&
            p.status === "suspended" &&
            p.rightsFrozenState !== null &&
            (p.kind === "adult"
              ? p.userId === op.requesterUserId
              : vinculos.some(
                  (v) =>
                    v.profileId === p.id &&
                    v.guardianUserId === op.requesterUserId &&
                    alvos.some((a) => a.profileReference === p.id && a.guardianReference === v.id),
                )),
        ),
      "DIREITOS_INTEGRIDADE",
      "A autoridade pessoal congelada mudou.",
    );
    // Dirigir a busca pela chave usa o índice composto profile/game/key e o
    // índice do histórico por data_id. Não varrer BLOBs de todos os perfis.
    const historico = await tx
      .select({ id: versions.id })
      .from(keys)
      .innerJoin(versions, eq(versions.dataId, keys.id))
      .where(and(inArray(keys.profileId, ids), inArray(versions.profileId, ids)))
      .orderBy(versions.dataId, versions.createdAt)
      .limit(100);
    let dominio: "versions" | "keys" | "achievements", quantidade: number;
    if (historico.length) {
      const apagadas = await tx
        .delete(versions)
        .where(
          and(
            inArray(versions.profileId, ids),
            inArray(
              versions.id,
              historico.map((v) => v.id),
            ),
          ),
        )
        .returning({ id: versions.id });
      dominio = "versions";
      quantidade = apagadas.length;
    } else {
      const chaves = await tx
        .select({ id: keys.id })
        .from(keys)
        .where(inArray(keys.profileId, ids))
        .orderBy(keys.id)
        .limit(100);
      if (chaves.length) {
        const apagadas = await tx
          .delete(keys)
          .where(
            and(
              inArray(keys.profileId, ids),
              inArray(
                keys.id,
                chaves.map((k) => k.id),
              ),
            ),
          )
          .returning({ id: keys.id });
        dominio = "keys";
        quantidade = apagadas.length;
      } else {
        const conquistas = await tx
          .select({ id: achievements.id })
          .from(achievements)
          .where(inArray(achievements.profileId, ids))
          .orderBy(achievements.id)
          .limit(100);
        const apagadas = conquistas.length
          ? await tx
              .delete(achievements)
              .where(
                and(
                  inArray(achievements.profileId, ids),
                  inArray(
                    achievements.id,
                    conquistas.map((a) => a.id),
                  ),
                ),
              )
              .returning({ id: achievements.id })
          : [];
        dominio = "achievements";
        quantidade = apagadas.length;
      }
    }
    assertAllowed(
      quantidade > 0 && quantidade <= 100,
      "DIREITOS_INTEGRIDADE",
      "O lote pessoal deixou de estar disponível.",
    );
    await logAuditEventStrict(
      "recreio.rights_profile_data_removed",
      op.requesterUserId,
      { app: "recreio", operationId: op.id, domain: dominio, count: quantidade },
      { writer: tx },
    );
    return { situacao: "dados_removidos" as const, operacaoId: op.id, dominio, quantidade };
  });
}
