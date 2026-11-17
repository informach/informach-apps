import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, eq, sql } from "@informach/db";
import {
  recreioModerationCommands as commands,
  recreioDirectedSpaceInvites as directed,
  recreioSpaceInvites as invites,
  recreioSafetyReports as reports,
  recreioProfileRestrictions as restrictions,
  recreioRestrictionReviews as reviews,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { PerfilIdSchema } from "@informach/recreio";
import type { ReciboDeModeracao } from "@informach/recreio/contrato";
import {
  ComposicaoSocialMudou,
  travarComposicaoSocial,
} from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";
import { type Transacao, travar } from "@/lib/repository";
import { admitirEquipeDeModeracao, type ProvaDeModeracao } from "./autoridade-repository";
import { aplicarEfeitoDeModeracao } from "./efeitos-repository";
import { mudarRestricaoSobTrava } from "./restricao-efeito-repository";

const DIA = 86_400_000;
async function pista(tx: Transacao, prova: ProvaDeModeracao) {
  const c = prova.comando;
  if (c.operacao === "responder_recurso") {
    const [r] = await tx
      .select({ perfilId: reviews.profileId })
      .from(reviews)
      .where(eq(reviews.id, c.protocolo));
    return { perfis: r ? [r.perfilId] : [], mundoId: null };
  }
  const [r] = await tx
    .select({ origem: reports.reporterProfileId, alvo: reports.targetProfileId })
    .from(reports)
    .where(eq(reports.id, c.protocolo));
  const [convite] =
    c.operacao === "invalidar_convite"
      ? await tx
          .select({ mundoId: invites.spaceId })
          .from(invites)
          .where(eq(invites.id, c.conviteId))
      : [];
  const [dirigido] =
    c.operacao === "invalidar_convite"
      ? await tx
          .select({ mundoId: directed.spaceId })
          .from(directed)
          .where(eq(directed.id, c.conviteId))
      : [];
  assertAllowed(
    !(convite && dirigido),
    "CONFLITO",
    "A referência do convite precisa de conferência.",
  );
  return {
    perfis: [...new Set([r?.origem, r?.alvo].filter((id): id is string => !!id))].sort(),
    mundoId: convite?.mundoId ?? dirigido?.mundoId ?? null,
  };
}

/** Somente prova assinada já verificada no serviço; nenhuma autoridade vem do corpo HTTP. */
async function tentar(prova: ProvaDeModeracao): Promise<ReciboDeModeracao> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const c = prova.comando;
    // A chave é global: outra conta/caso não pode reutilizar o UUID de um comando.
    await travar(tx, `recreio:moderation-command:${c.comandoId}`);
    const inicial = await pista(tx, prova);
    const composicao = await travarComposicaoSocial(
      tx,
      { tipo: "equipe", contaId: prova.contaId },
      inicial.perfis.map((id) => PerfilIdSchema.parse(id)),
      async () => {
        await admitirEquipeDeModeracao(tx, prova);
        if (inicial.mundoId)
          await tx
            .select({ id: spaces.id })
            .from(spaces)
            .where(eq(spaces.id, inicial.mundoId))
            .for("update");
      },
    );
    if (JSON.stringify(inicial) !== JSON.stringify(await pista(tx, prova)))
      throw new ComposicaoSocialMudou();
    const { conferirPrazo } = await admitirEquipeDeModeracao(tx, prova);
    const agora = await conferirPrazo();
    const [recibo] = await tx.select().from(commands).where(eq(commands.id, c.comandoId));
    if (recibo) {
      assertAllowed(
        recibo.moderatorUserId === prova.contaId &&
          recibo.requestHash === prova.resumo &&
          recibo.expiresAt > agora,
        "CONFLITO",
        "Este comando mudou ou venceu. Reabra o caso antes de continuar.",
      );
      await conferirPrazo();
      return {
        comandoId: c.comandoId,
        protocolo: c.protocolo,
        versaoDoCaso: recibo.caseRevision,
        operacao: recibo.operation,
        repetido: true,
      };
    }
    let revisao: number;
    if (c.operacao === "responder_recurso") {
      const [caso] = await tx
        .select()
        .from(reviews)
        .where(eq(reviews.id, c.protocolo))
        .for("update");
      const perfil = composicao.perfis.find((p) => p.id === c.perfilId);
      const [restricao] = await tx
        .select()
        .from(restrictions)
        .where(eq(restrictions.profileId, c.perfilId))
        .for("update");
      assertAllowed(
        caso &&
          caso.state === "aberto" &&
          caso.revision === c.versaoDoCaso &&
          caso.expiresAt > agora &&
          caso.profileId === c.perfilId &&
          restricao?.state === "suspended" &&
          restricao.revision === c.versaoDaRestricao &&
          caso.restrictionRevision === restricao.revision &&
          perfil?.status === "suspended" &&
          perfil.policyVersion === c.versaoDoPerfil,
        "CONFLITO",
        "O recurso ou a restrição mudou. Reabra o caso.",
      );
      assertAllowed(
        c.decisao === "reativar"
          ? ["recurso_procedente", "correcao_operacional"].includes(c.motivo)
          : ["risco_confirmado", "medida_preventiva"].includes(c.motivo),
        "CONFLITO",
        "O motivo não corresponde à decisão.",
      );
      if (c.decisao === "reativar")
        await mudarRestricaoSobTrava(
          tx,
          {
            perfilId: c.perfilId,
            versaoDoPerfil: c.versaoDoPerfil,
            estado: "active",
            motivo: c.motivo,
            reportId: restricao.sourceReportId,
            recursoId: caso.id,
          },
          composicao,
          prova.contaId,
          conferirPrazo,
        );
      const respondidoEm = await conferirPrazo();
      revisao = caso.revision + 1;
      await tx
        .update(reviews)
        .set({
          state: "resolvido",
          decision: c.decisao,
          revision: revisao,
          resolvedAt: respondidoEm,
          expiresAt: new Date(
            Math.min(caso.expiresAt.getTime(), respondidoEm.getTime() + 90 * DIA),
          ),
        })
        .where(eq(reviews.id, caso.id));
    } else {
      const [caso] = await tx
        .select()
        .from(reports)
        .where(eq(reports.id, c.protocolo))
        .for("update");
      assertAllowed(
        caso &&
          caso.revision === c.versaoDoCaso &&
          caso.expiresAt > agora &&
          caso.revision < 2147483647,
        "CONFLITO",
        "A denúncia mudou ou venceu. Reabra a fila.",
      );
      const efeito = await aplicarEfeitoDeModeracao(
        tx,
        c,
        caso,
        composicao,
        prova.contaId,
        conferirPrazo,
        inicial.mundoId,
      );
      revisao = caso.revision + 1;
      await tx
        .update(reports)
        .set({
          state: efeito.estado,
          decision: efeito.decisao,
          revision: revisao,
          updatedAt: await conferirPrazo(),
        })
        .where(eq(reports.id, caso.id));
    }
    const criadoEm = await conferirPrazo();
    await tx.insert(commands).values({
      id: c.comandoId,
      moderatorUserId: prova.contaId,
      requestHash: prova.resumo,
      operation: c.operacao,
      reportId: c.operacao === "responder_recurso" ? null : c.protocolo,
      restrictionReviewId: c.operacao === "responder_recurso" ? c.protocolo : null,
      caseKind: c.operacao === "responder_recurso" ? "recurso_restricao" : "denuncia",
      caseRevision: revisao,
      createdAt: criadoEm,
      expiresAt: new Date(criadoEm.getTime() + 180 * DIA),
    });
    await logAuditEventStrict(
      "recreio.moderation_command_applied",
      prova.contaId,
      {
        app: "recreio",
        commandId: c.comandoId,
        caseId: c.protocolo,
        caseKind: c.operacao === "responder_recurso" ? "recurso_restricao" : "denuncia",
        operation: c.operacao,
        revision: revisao,
        ...("perfilId" in c ? { profileId: c.perfilId } : {}),
        ...("motivo" in c ? { reason: c.motivo } : {}),
        ...("decisao" in c ? { decision: c.decisao } : {}),
      },
      { writer: tx },
    );
    await conferirPrazo();
    return {
      comandoId: c.comandoId,
      protocolo: c.protocolo,
      versaoDoCaso: revisao,
      operacao: c.operacao,
      repetido: false,
    };
  });
}
export async function executarComandoDeModeracaoNoBanco(prova: ProvaDeModeracao) {
  try {
    return await tentar(prova);
  } catch (erro) {
    if (!(erro instanceof ComposicaoSocialMudou)) throw erro;
    return tentar(prova);
  }
}
