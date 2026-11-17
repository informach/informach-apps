import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioGroups as groups,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { type GrupoId, GrupoIdSchema, PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { admitirGrupoDoTitular } from "./autoridade-repository";
import type { CoberturaDoGrupo } from "./regras";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** A busca é só uma pista; o leitor abaixo admite novamente a conta e o grupo. */
export async function lerGrupoDoTitular(autor: IdentidadeNativa) {
  const [grupo] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  if (grupo) return lerComposicaoDoGrupo(autor, GrupoIdSchema.parse(grupo.id));
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativa = await autorizarContaNativa(tx, autor);
    await nativa.conferirPrazo();
    return null;
  });
}

export async function lerComposicaoDoGrupo(autor: IdentidadeNativa, grupoId: GrupoId) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share");
    const fatos = await lerFatosDoGrupo(grupoId, tx);
    assertAllowed(fatos, "GRUPO", "Grupo não disponível.");
    const plano = decidirPlanoLido(fatos, await atual.nativa.conferirPrazo());
    return {
      grupoId,
      limite: plano.limiteDePerfis,
      estado: plano.estado,
      perfis: atual.perfis.map((p) => ({
        perfilId: PerfilIdSchema.parse(p.id),
        apelido:
          p.kind === "adult" ||
          atual.vinculos.some((v) => v.perfilId === p.id && v.responsavelId === autor.contaId)
            ? p.nickname
            : "Perfil protegido",
        tipo: p.kind,
        ativo: p.status === "active",
        versao: p.policyVersion,
        selecionado: p.coverageEnabled,
        efetivo:
          p.status === "active" &&
          p.coverageEnabled &&
          fatos.cobertos.includes(PerfilIdSchema.parse(p.id)) &&
          fatos.cobertos.indexOf(PerfilIdSchema.parse(p.id)) < plano.limiteDePerfis,
      })),
    };
  });
}

/** A seleção muda cobertura e revisão, nunca identidade, responsabilidade ou conteúdo. */
export async function gravarCoberturaDoGrupo(autor: AutorNativoRecente, pedido: CoberturaDoGrupo) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, pedido.grupoId, "update");
    const conferirSelecao = async () => {
      const fatos = await lerFatosDoGrupo(pedido.grupoId, tx);
      assertAllowed(fatos, "GRUPO", "Grupo não disponível.");
      const plano = decidirPlanoLido(fatos, await atual.nativa.conferirPrazo(autor.login));
      const aumenta = pedido.perfis.some(
        (p) =>
          p.cobrir &&
          atual.perfis.some((atual) => atual.id === p.perfilId && !atual.coverageEnabled),
      );
      assertAllowed(
        !aumenta || env.RECREIO_FAMILY_MODE !== "off",
        "FAMILIA_INDISPONIVEL",
        "Novas coberturas ainda não estão disponíveis neste acesso.",
      );
      assertAllowed(
        !aumenta || pedido.perfis.filter((p) => p.cobrir).length <= plano.limiteDePerfis,
        "LIMITE_DE_PERFIS",
        "A seleção excede a cobertura atual do plano.",
      );
    };
    assertAllowed(
      atual.perfis.length === pedido.perfis.length &&
        atual.perfis.every((p) =>
          pedido.perfis.some((e) => e.perfilId === p.id && e.versao === p.policyVersion),
        ),
      "CONFLITO",
      "O grupo mudou. Reabra a gestão antes de continuar.",
    );
    for (const pedidoDoPerfil of pedido.perfis) {
      const perfil = atual.perfis.find((p) => p.id === pedidoDoPerfil.perfilId);
      assertAllowed(perfil, "GRUPO", "Perfil não disponível.");
      assertAllowed(
        !pedidoDoPerfil.cobrir || perfil.status === "active",
        "PERFIL",
        "Perfil não disponível.",
      );
    }
    await conferirSelecao();
    const mudancas = atual.perfis.filter((p) =>
      pedido.perfis.some((e) => e.perfilId === p.id && e.cobrir !== p.coverageEnabled),
    );
    const agora = await atual.nativa.conferirPrazo(autor.login);
    for (const perfil of mudancas) {
      assertAllowed(perfil.policyVersion < 2147483646, "PERFIL", "Perfil não disponível.");
      const escolha = pedido.perfis.find((p) => p.perfilId === perfil.id);
      assertAllowed(escolha, "GRUPO", "Perfil não disponível.");
      await tx
        .update(profiles)
        .set({
          coverageEnabled: escolha.cobrir,
          policyVersion: perfil.policyVersion + 1,
          updatedAt: agora,
        })
        .where(eq(profiles.id, perfil.id));
      const perfilId = PerfilIdSchema.parse(perfil.id);
      await invalidarIngressosDoPerfil(tx, perfilId);
      await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
        porQuem: "recreio",
      });
      await logAuditEventStrict(
        "recreio.group_coverage_updated",
        autor.contaId,
        {
          app: "recreio",
          groupId: pedido.grupoId,
          profileId: perfilId,
          revision: perfil.policyVersion + 1,
          enabled: escolha.cobrir,
        },
        { writer: tx },
      );
    }
    // Inclui espera do cursor/auditoria e vencimento de cortesia no próprio commit.
    await conferirSelecao();
    return { alterados: mudancas.length };
  });
}
