import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import { recreioGameSessions as games, recreioProfiles as profiles } from "@informach/db/schema";
import { limiteDePerfisDoTier, PerfilIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { CoberturaPropria } from "./participacao-regras";
import { GrupoCriadoDuranteEspera, prepararGrupoDoTitular } from "./preparar-repository";

async function tentar(autor: AutorNativoRecente, pedido: CoberturaPropria) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const atual = await prepararGrupoDoTitular(tx, autor, "update");
    const [perfil] = await tx
      .select()
      .from(profiles)
      .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")))
      .for("update");
    assertAllowed(perfil, "PERFIL", "Crie seu perfil de jogador para continuar.");
    assertAllowed(
      perfil.groupId === null || perfil.groupId === atual.grupoId,
      "SAIA_DO_GRUPO",
      "Saia do grupo atual antes de escolher outra cobertura.",
    );
    if (perfil.groupId === atual.grupoId && perfil.coverageEnabled) {
      await atual.nativa.conferirPrazo(autor.login);
      return { alterado: false as const };
    }
    assertAllowed(
      env.RECREIO_FAMILY_MODE !== "off",
      "FAMILIA_INDISPONIVEL",
      "Novas coberturas ainda não estão disponíveis neste acesso.",
    );
    assertAllowed(
      perfil.status === "active" &&
        perfil.policyVersion === pedido.versao &&
        pedido.versao < 2147483646,
      "CONFLITO",
      "O perfil mudou. Reabra a gestão antes de continuar.",
    );
    const cadastrados = await tx
      .select({ id: profiles.id, ligada: profiles.coverageEnabled })
      .from(profiles)
      .where(eq(profiles.groupId, atual.grupoId));
    assertAllowed(
      cadastrados.length + Number(perfil.groupId === null) <= limiteDePerfisDoTier("family"),
      "LIMITE_DE_PERFIS",
      "Este grupo já tem quatro perfis.",
    );
    const selecionados = cadastrados.filter((p) => p.id !== perfil.id && p.ligada).length + 1;
    const conferirCapacidade = async () => {
      const fatos = await lerFatosDoGrupo(atual.grupoId, tx);
      assertAllowed(fatos, "GRUPO", "Grupo não disponível.");
      const plano = decidirPlanoLido(fatos, await atual.nativa.conferirPrazo(autor.login));
      assertAllowed(
        selecionados <= plano.limiteDePerfis,
        "SEM_COBERTURA",
        "Sua cobertura atual não tem uma vaga disponível para este perfil.",
      );
    };
    await conferirCapacidade();
    const perfilId = PerfilIdSchema.parse(perfil.id);
    const agora = await atual.nativa.conferirPrazo(autor.login);
    await tx
      .update(profiles)
      .set({
        groupId: atual.grupoId,
        coverageEnabled: true,
        policyVersion: perfil.policyVersion + 1,
        updatedAt: agora,
      })
      .where(eq(profiles.id, perfil.id));
    await invalidarIngressosDoPerfil(tx, perfilId);
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
      porQuem: "recreio",
    });
    await logAuditEventStrict(
      "recreio.group_coverage_updated",
      autor.contaId,
      {
        app: "recreio",
        groupId: atual.grupoId,
        profileId: perfilId,
        revision: perfil.policyVersion + 1,
        enabled: true,
      },
      { writer: tx },
    );
    await conferirCapacidade();
    return { alterado: true as const, perfilId, versao: perfil.policyVersion + 1 };
  });
}

export async function usarCoberturaPropriaNoBanco(
  autor: AutorNativoRecente,
  pedido: CoberturaPropria,
) {
  try {
    return await tentar(autor, pedido);
  } catch (erro) {
    if (!(erro instanceof GrupoCriadoDuranteEspera)) throw erro;
    return tentar(autor, pedido);
  }
}
