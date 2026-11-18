import "server-only";
import { and, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  recreioProfileRestrictions as restrictions,
  recreioRestrictionReviews as reviews,
} from "@informach/db/schema";
import { ContaIdSchema, PerfilIdSchema } from "@informach/recreio";
import { revogarAparelhosDoMenorSobTrava } from "@/features/protecao/repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import type { ComposicaoSocial } from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

/** Chamador já admitiu equipe e travou contas, perfis e o caso. Não concede acesso novo. */
export async function mudarRestricaoSobTrava(
  tx: Transacao,
  entrada: {
    perfilId: string;
    versaoDoPerfil: number;
    estado: "suspended" | "active";
    motivo:
      | "risco_confirmado"
      | "medida_preventiva"
      | "recurso_procedente"
      | "correcao_operacional";
    reportId: string | null;
    recursoId?: string;
  },
  composicao: ComposicaoSocial,
  contaId: string,
  conferirPrazo: () => Promise<Date>,
) {
  const perfil = composicao.perfis.find((p) => p.id === entrada.perfilId);
  assertAllowed(
    perfil &&
      perfil.policyVersion === entrada.versaoDoPerfil &&
      perfil.status === (entrada.estado === "active" ? "suspended" : "active") &&
      perfil.policyVersion < 2147483647,
    "CONFLITO",
    "O perfil mudou. Confira a situação atual antes de agir.",
  );
  assertAllowed(
    (entrada.estado === "suspended" &&
      ["risco_confirmado", "medida_preventiva"].includes(entrada.motivo)) ||
      (entrada.estado === "active" &&
        ["recurso_procedente", "correcao_operacional"].includes(entrada.motivo)),
    "CONFLITO",
    "O motivo não corresponde à ação.",
  );
  const perfilId = PerfilIdSchema.parse(perfil.id);
  const pendentes = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.profileId, perfilId), eq(reviews.state, "aberto")))
    .for("update");
  assertAllowed(
    pendentes.every((p) => p.id === entrada.recursoId),
    "CONFLITO",
    "Há um recurso em aberto. A equipe deve responder por esse protocolo.",
  );
  const agora = await conferirPrazo();
  if (perfil.kind === "minor" && entrada.estado === "suspended") {
    const [atual] = await tx
      .select({ vinculoId: protection.guardianLinkId })
      .from(protection)
      .where(eq(protection.profileId, perfilId))
      .for("update");
    assertAllowed(
      atual &&
        composicao.vinculos.some((v) => v.profileId === perfilId && v.id === atual.vinculoId),
      "CONFLITO",
      "A responsabilidade mudou. Confira o caso novamente.",
    );
    await revogarAparelhosDoMenorSobTrava(tx, perfilId, agora);
  }
  const revisao = perfil.policyVersion + 1;
  await tx
    .update(profiles)
    .set({ status: entrada.estado, policyVersion: revisao, updatedAt: agora })
    .where(eq(profiles.id, perfilId));
  // A versão do perfil é monotônica mesmo se um recibo antigo já foi expurgado.
  const fato = {
    revision: revisao,
    state: entrada.estado === "suspended" ? ("suspended" as const) : ("released" as const),
    reason: entrada.motivo,
    sourceReportId: entrada.reportId,
    moderatorUserId: contaId,
    updatedAt: agora,
    releasedAt: entrada.estado === "active" ? agora : null,
  };
  await tx
    .insert(restrictions)
    .values({ profileId: perfilId, ...fato, createdAt: agora })
    .onConflictDoUpdate({ target: restrictions.profileId, set: fato });
  await invalidarIngressosDoPerfil(tx, perfilId);
  await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
    porQuem: "ator",
    contaId: ContaIdSchema.parse(contaId),
  });
  return revisao;
}
