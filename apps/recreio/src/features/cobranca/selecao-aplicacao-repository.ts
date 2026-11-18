import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { eq, inArray } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import {
  conferirSelecaoDaTroca,
  perfisParaSelecionarNaTroca,
  type SelecaoDaTroca,
} from "./troca-selecao";

/** Caller has admitted the native group/profiles and holds the complete
 * financial capture transaction. An old selection only retains or reduces. */
export async function aplicarSelecaoAdmitidaLocked(
  tx: Transacao,
  entrada: {
    grupoId: string;
    paganteId: string;
    produtoId: string;
    selecao: readonly SelecaoDaTroca[];
    agora: Date;
  },
) {
  const atuais = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.groupId, entrada.grupoId))
    .orderBy(profiles.id)
    .for("update");
  const vinculos = atuais.length
    ? await tx
        .select({ perfilId: guardians.profileId })
        .from(guardians)
        .where(
          inArray(
            guardians.profileId,
            atuais.map((p) => p.id),
          ),
        )
        .orderBy(guardians.profileId)
        .for("share")
    : [];
  try {
    conferirSelecaoDaTroca(
      entrada.grupoId,
      entrada.produtoId,
      entrada.selecao,
      perfisParaSelecionarNaTroca(atuais, vinculos),
    );
  } catch (error) {
    if (!(error instanceof AppError) || !["CONFLITO", "LIMITE_DE_PERFIS"].includes(error.code))
      throw error;
    return { emConferencia: true };
  }
  for (const perfil of atuais) {
    const escolha = entrada.selecao.find((s) => s.profileReference === perfil.id);
    assertAllowed(escolha, "ORIGEM_FINANCEIRA", "Seleção financeira incompleta.");
    if (escolha.coverageEnabled === perfil.coverageEnabled) continue;
    assertAllowed(
      !escolha.coverageEnabled,
      "ORIGEM_FINANCEIRA",
      "Uma seleção antiga não reativa cobertura.",
    );
    await tx
      .update(profiles)
      .set({
        coverageEnabled: false,
        policyVersion: perfil.policyVersion + 1,
        updatedAt: entrada.agora,
      })
      .where(eq(profiles.id, perfil.id));
    await invalidarIngressosDoPerfil(tx, PerfilIdSchema.parse(perfil.id));
    await logAuditEventStrict(
      "recreio.group_coverage_updated",
      entrada.paganteId,
      {
        app: "recreio",
        groupId: entrada.grupoId,
        profileId: perfil.id,
        revision: perfil.policyVersion + 1,
        enabled: false,
      },
      { writer: tx },
    );
  }
  return { emConferencia: false };
}
