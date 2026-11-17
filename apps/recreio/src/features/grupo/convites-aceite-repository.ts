import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, or, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioGroups as groups,
  recreioGroupInvites as invites,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import {
  GrupoIdSchema,
  limiteDePerfisDoTier,
  type PerfilId,
  PerfilIdSchema,
} from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDoGrupo } from "@/features/acesso/repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { admitirGrupoParaAceite, ComposicaoDoGrupoMudou } from "./autoridade-repository";
import { type AceiteDeGrupo, VERSAO_DA_DECLARACAO_ADULTA } from "./convites-regras";
import { escopoDoDestinatario } from "./destinatario-repository";

/** Aceitar não transfere responsabilidade, conteúdo, contrato ou administração. */
async function tentarAceitar(autor: AutorNativoRecente, pedido: AceiteDeGrupo) {
  const hash = createHash("sha256").update(JSON.stringify(pedido)).digest("hex");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    // Pista restrita ao destinatário; a autoridade é conferida novamente sob as travas.
    const [pista] = await tx
      .select({ grupoId: invites.groupId })
      .from(invites)
      .innerJoin(users, eq(users.id, autor.contaId))
      .where(
        and(
          eq(invites.id, pedido.conviteId),
          or(
            and(eq(invites.state, "accepted"), eq(invites.acceptedUserId, autor.contaId)),
            and(
              eq(invites.state, "pending"),
              eq(invites.recipientEmail, sql`lower(btrim(${users.email}))`),
              or(isNull(invites.recipientUserId), eq(invites.recipientUserId, autor.contaId)),
            ),
          ),
        ),
      );
    assertAllowed(pista, "CONVITE", "Convite não disponível.");
    const atual = await admitirGrupoParaAceite(tx, autor, GrupoIdSchema.parse(pista.grupoId));
    const [conta] = await tx
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, autor.contaId));
    assertAllowed(conta, "AUTH", "Entre novamente para continuar.");
    const [linha] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.id, pedido.conviteId), eq(invites.groupId, atual.grupo.id)))
      .for("update");
    assertAllowed(linha, "CONVITE", "Convite não disponível.");
    let agora = await atual.nativa.conferirPrazo(autor.login);
    if (linha.state === "accepted") {
      assertAllowed(
        linha.acceptedUserId === autor.contaId &&
          linha.acceptedProfileId &&
          linha.requestHash === hash,
        "CONVITE",
        "Convite não disponível.",
      );
      // Recibo não reanexa quem saiu, não renova cobertura e não reativa credenciais.
      return { aceito: true as const, perfilId: PerfilIdSchema.parse(linha.acceptedProfileId) };
    }
    assertAllowed(
      env.RECREIO_FAMILY_MODE !== "off",
      "FAMILIA_INDISPONIVEL",
      "Novas participações ainda não estão disponíveis neste acesso.",
    );
    const [dirigido] = await tx
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.id, linha.id),
          escopoDoDestinatario(autor.contaId, conta.email.trim().toLowerCase()),
        ),
      );
    assertAllowed(
      dirigido &&
        linha.state === "pending" &&
        linha.expiresAt > agora &&
        linha.inviterUserId !== autor.contaId &&
        linha.inviterDeclarationVersion === VERSAO_DA_DECLARACAO_ADULTA,
      "CONVITE",
      "Convite não disponível.",
    );
    const [proprio] = await tx
      .select()
      .from(profiles)
      .where(and(eq(profiles.userId, autor.contaId), eq(profiles.kind, "adult")))
      .for("update");
    if (pedido.perfil.tipo === "existente") {
      assertAllowed(
        proprio && proprio.status === "active" && proprio.policyVersion === pedido.perfil.versao,
        "CONFLITO",
        "O perfil mudou. Reabra o convite antes de continuar.",
      );
      const [origemPropria] = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.ownerUserId, autor.contaId));
      assertAllowed(
        proprio.groupId === null || proprio.groupId === origemPropria?.id,
        "SAIA_DO_GRUPO",
        "Saia do grupo atual antes de aceitar outro convite.",
      );
    } else
      assertAllowed(
        !proprio,
        "CONFLITO",
        "Seu perfil já existe. Reabra o convite para preservá-lo.",
      );
    assertAllowed(
      atual.perfis.length < limiteDePerfisDoTier("family"),
      "LIMITE_DE_PERFIS",
      "Este grupo já tem quatro perfis.",
    );
    const selecionados =
      atual.perfis.filter((p) => p.coverageEnabled).length + Number(pedido.cobrir);
    const conferir = async () => {
      agora = await atual.nativa.conferirPrazo(autor.login);
      assertAllowed(
        linha.expiresAt > agora,
        "CONVITE",
        "O convite venceu. Peça outro convite ao titular.",
      );
      assertAllowed(
        atual.titular?.emailVerified &&
          !(
            atual.titular.banned &&
            (!atual.titular.banExpiresAt || atual.titular.banExpiresAt > agora)
          ),
        "CONVITE",
        "Convite não disponível.",
      );
      if (pedido.cobrir) {
        const fatos = await lerFatosDoGrupo(GrupoIdSchema.parse(atual.grupo.id), tx);
        assertAllowed(fatos, "GRUPO", "Grupo não disponível.");
        agora = await atual.nativa.conferirPrazo(autor.login);
        assertAllowed(
          linha.expiresAt > agora,
          "CONVITE",
          "O convite venceu. Peça outro convite ao titular.",
        );
        const plano = decidirPlanoLido(fatos, agora);
        assertAllowed(
          selecionados <= plano.limiteDePerfis,
          "SEM_COBERTURA",
          "O grupo não tem uma vaga disponível para jogar. O titular precisa ajustar a cobertura.",
        );
      }
    };
    await conferir();
    let perfilId: PerfilId;
    if (pedido.perfil.tipo === "existente") {
      assertAllowed(proprio, "PERFIL", "Perfil não disponível.");
      perfilId = PerfilIdSchema.parse(proprio.id);
      await tx
        .update(profiles)
        .set({
          groupId: atual.grupo.id,
          coverageEnabled: pedido.cobrir,
          policyVersion: proprio.policyVersion + 1,
          updatedAt: agora,
        })
        .where(eq(profiles.id, perfilId));
      await invalidarIngressosDoPerfil(tx, perfilId);
      await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
        porQuem: "ator",
        contaId: autor.contaId,
      });
    } else {
      const [novo] = await tx
        .insert(profiles)
        .values({
          userId: autor.contaId,
          kind: "adult",
          groupId: atual.grupo.id,
          nickname: pedido.perfil.dados.apelido,
          avatar: pedido.perfil.dados.avatar,
          coverageEnabled: pedido.cobrir,
        })
        .returning({ id: profiles.id });
      assertAllowed(novo, "PERFIL", "Não foi possível criar seu perfil.");
      perfilId = PerfilIdSchema.parse(novo.id);
      await logAuditEventStrict(
        "recreio.profile_created",
        autor.contaId,
        { app: "recreio", profileId: perfilId, kind: "adult" },
        { writer: tx },
      );
    }
    await tx
      .update(invites)
      .set({
        state: "accepted",
        recipientEmail: null,
        senderLabel: null,
        recipientUserId: null,
        acceptedUserId: autor.contaId,
        acceptedProfileId: perfilId,
        recipientDeclarationVersion: pedido.versaoDaDeclaracao,
        requestHash: hash,
        finishedAt: agora,
      })
      .where(eq(invites.id, linha.id));
    await logAuditEventStrict(
      "recreio.group_invite_accepted",
      autor.contaId,
      {
        app: "recreio",
        groupId: atual.grupo.id,
        inviteId: linha.id,
        profileId: perfilId,
        enabled: pedido.cobrir,
        declarationVersion: pedido.versaoDaDeclaracao,
      },
      { writer: tx },
    );
    await conferir();
    return { aceito: true as const, perfilId };
  });
}

export async function aceitarConviteNoBanco(autor: AutorNativoRecente, pedido: AceiteDeGrupo) {
  try {
    return await tentarAceitar(autor, pedido);
  } catch (erro) {
    if (!(erro instanceof ComposicaoDoGrupoMudou)) throw erro;
    // Nova admissão após rollback; não reter travas da composição anterior.
    return tentarAceitar(autor, pedido);
  }
}
