import "server-only";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceLeases as leases,
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
  recreioRightsProfileProjection,
  recreioRightsWorldProjection,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { z } from "zod";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
} from "@/features/account/autoridade-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { travarComposicaoDeDireitos } from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, travar } from "@/lib/repository";
import { mesmoEscopoDeDireitos } from "./escopo";
import { type criarAssinaturaDoLivro, resumoDoRegistro } from "./livro/assinatura";
import { ReferenciaDaPreparacaoSchema } from "./preparacao-contrato";
import { lerPlanoDeDireitos, montarPlanoDeDireitos } from "./preparacao-repository";

const Consentimento = ReferenciaDaPreparacaoSchema.extend({ confirmoRetirada: z.literal(true) });
const Configuracao = z.strictObject({
  fonte: z.string().regex(/^[a-f0-9]{40}$/),
  epoca: z.number().int().min(0).max(15),
});
type Assinatura = ReturnType<typeof criarAssinaturaDoLivro>;
function recibo(linha: typeof operations.$inferSelect) {
  return {
    operacaoId: linha.id,
    preparacaoId: linha.preparationId,
    estado: linha.state,
    consentidaEm: linha.consentedAt.toISOString(),
  };
}

/** Núcleo servidor, ainda sem rota/action de ativação. Apenas retirada de um
 * perfil e mundos já fechados com foto consistente; nunca toma uma posse ativa
 * nem perde o progresso de outro participante para conseguir congelar.
 * A conta global, cobrança e conteúdo do jogo não são excluídos neste passo. */
export function consentirRetiradaNoBanco(
  autor: AutorNativoRecente,
  entrada: unknown,
  config: { assinatura: Assinatura; fonte: string; epoca: number },
) {
  const pedido = Consentimento.parse(entrada),
    { fonte, epoca } = Configuracao.parse({ fonte: config.fonte, epoca: config.epoca });
  const { assinatura } = config;
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    await travar(tx, `recreio:direitos:preparacao:${pedido.preparacaoId}`);
    const [anterior] = await tx
      .select()
      .from(operations)
      .where(eq(operations.preparationId, pedido.preparacaoId));
    if (anterior) {
      assertAllowed(
        anterior.requesterUserId === autor.contaId && anterior.planSha256 === pedido.planoSha256,
        "DIREITOS",
        "Pedido não disponível.",
      );
      const nativa = await autorizarContaNativa(tx, autor);
      await nativa.conferirPrazo(autor.login);
      return recibo(anterior);
    }
    const [pista] = await tx
      .select()
      .from(preparations)
      .where(
        and(
          eq(preparations.id, pedido.preparacaoId),
          eq(preparations.requesterUserId, autor.contaId),
          eq(preparations.planSha256, pedido.planoSha256),
        ),
      );
    assertAllowed(pista, "DIREITOS", "Prepare uma nova prévia para continuar.");
    const plano = lerPlanoDeDireitos(pista, autor.contaId);
    assertAllowed(
      plano.tipo === "retirar_perfil",
      "ESCOPO",
      "Este consentimento é exclusivo da retirada de um perfil.",
    );
    const ids = plano.perfis.map((p) => p.id),
      idsMundos = plano.mundos.map((m) => m.id);
    await travarComposicaoDeDireitos(tx, autor.contaId, ids, async (transacao) => {
      if (!idsMundos.length) return;
      const linhas = await transacao
        .select()
        .from(spaces)
        .where(inArray(spaces.id, idsMundos))
        .orderBy(spaces.id)
        .for("update");
      assertAllowed(
        linhas.length === idsMundos.length,
        "ESCOPO",
        "Os mundos mudaram. Prepare uma nova prévia.",
      );
    });
    // Reconstituir depois das contas/mundos/perfis sob trava, sem adquirir um
    // mundo descoberto tardiamente depois de segurar um perfil.
    const atual = await montarPlanoDeDireitos(tx, autor, {
      pedidoId: pista.id,
      tipo: plano.tipo,
      perfis: ids,
    });
    assertAllowed(
      mesmoEscopoDeDireitos(plano, atual),
      "ESCOPO",
      "As responsabilidades ou os mundos mudaram. Prepare uma nova prévia.",
    );
    const [preparacao] = await tx
      .select()
      .from(preparations)
      .where(eq(preparations.id, pista.id))
      .for("update");
    assertAllowed(
      preparacao &&
        preparacao.cancelledAt === null &&
        isDeepStrictEqual(lerPlanoDeDireitos(preparacao, autor.contaId), plano),
      "DIREITOS",
      "Prepare uma nova prévia para continuar.",
    );
    const nativa = await autorizarContaNativa(tx, autor);
    const agora = await nativa.conferirPrazo(autor.login);
    assertAllowed(
      preparacao.expiresAt > agora,
      "DIREITOS",
      "A prévia venceu. Prepare outra antes de confirmar.",
    );
    const alvos = await tx
      .select()
      .from(profiles)
      .where(inArray(profiles.id, ids))
      .orderBy(profiles.id);
    assertAllowed(
      alvos.every((p) => p.rightsOperationId === null),
      "CONFLITO",
      "Um perfil já tem retirada em andamento.",
    );
    const mundos = idsMundos.length
      ? await tx.select().from(spaces).where(inArray(spaces.id, idsMundos)).orderBy(spaces.id)
      : [];
    for (const mundo of mundos) {
      assertAllowed(
        mundo.rightsOperationId === null && mundo.status !== "active",
        "MUNDO_EM_USO",
        "Saia do jogo e aguarde o salvamento antes de confirmar.",
      );
      assertAllowed(
        !atual.mundos.some(
          (m) =>
            m.id === mundo.id &&
            m.outrosParticipantes > 0 &&
            ids.some((id) => id === mundo.stewardProfileId),
        ),
        "RESPONSABILIDADE",
        "Transfira a responsabilidade pelo mundo compartilhado antes de retirar este perfil.",
      );
      const [posse] = await tx
        .select({ id: leases.id })
        .from(leases)
        .where(and(eq(leases.spaceId, mundo.id), isNull(leases.releasedAt)))
        .limit(1);
      const [sessao] = await tx
        .select({ id: games.id })
        .from(games)
        .where(and(eq(games.spaceId, mundo.id), isNull(games.endedAt)))
        .limit(1);
      assertAllowed(
        !posse && !sessao,
        "MUNDO_EM_USO",
        "Aguarde o encerramento confirmado das sessões e do salvamento.",
      );
      const [foto] = await tx
        .select({ diario: snapshots.journalSeq })
        .from(snapshots)
        .where(and(eq(snapshots.spaceId, mundo.id), eq(snapshots.revision, mundo.revision)))
        .limit(1);
      assertAllowed(
        mundo.revision === 0 ? mundo.journalSeq === 0 && !foto : foto?.diario === mundo.journalSeq,
        "SALVAMENTO",
        "O último salvamento precisa ser conferido antes da retirada.",
      );
    }
    const bytes = assinatura.assinarIntencao({
      formato: "recreio-intencao-direitos-v1",
      livroId: assinatura.livroId,
      operacaoId: preparacao.id,
      revisao: 1,
      epoca,
      tipo: plano.tipo,
      contaId: autor.contaId,
      perfilIds: ids,
      planoSha256: preparacao.planSha256,
      consentidaEm: agora.toISOString(),
      autenticadaEm: autor.login.criadoEm.toISOString(),
      fonte,
    });
    const [operacao] = await tx
      .insert(operations)
      .values({
        id: preparacao.id,
        preparationId: preparacao.id,
        requesterUserId: autor.contaId,
        planSha256: preparacao.planSha256,
        kind: plano.tipo,
        ledgerId: assinatura.livroId,
        ledgerEpoch: epoca,
        signingKeyId: assinatura.chaveAtiva,
        source: fonte,
        signedIntent: bytes,
        intentSha256: resumoDoRegistro(bytes),
        authenticatedAt: autor.login.criadoEm,
        consentedAt: agora,
        createdAt: agora,
        updatedAt: agora,
        nextAttemptAt: agora,
      })
      .returning();
    assertAllowed(operacao, "DIREITOS", "Não foi possível registrar o consentimento.");
    for (const perfil of alvos) {
      const original = plano.perfis.find((p) => p.id === perfil.id);
      assertAllowed(original, "ESCOPO", "Perfil fora da prévia.");
      await tx.insert(subjects).values({
        operationId: operacao.id,
        profileReference: perfil.id,
        liveProfileId: perfil.id,
        policyVersion: perfil.policyVersion,
        guardianReference: original.responsabilidadeId,
      });
      const versao = sql`${profiles.policyVersion}+1`;
      await tx
        .update(profiles)
        .set({
          status: "suspended",
          policyVersion: versao,
          rightsOperationId: operacao.id,
          rightsFrozenState: recreioRightsProfileProjection({
            ...profiles,
            status: sql`'suspended'`,
            policyVersion: versao,
          }),
          updatedAt: AGORA,
        })
        .where(eq(profiles.id, perfil.id));
    }
    for (const mundo of mundos) {
      assertAllowed(mundo.status !== "active", "MUNDO_EM_USO", "Mundo em uso.");
      await tx.insert(worlds).values({
        operationId: operacao.id,
        spaceId: mundo.id,
        sourceStatus: mundo.status,
        sourceRevision: mundo.revision,
        sourceJournalSeq: mundo.journalSeq,
        sourceLeaseEpoch: mundo.leaseEpoch,
        sourceManagementRevision: mundo.managementRevision,
      });
      const cerca = sql`${spaces.leaseEpoch}+1`,
        gestao = sql`${spaces.managementRevision}+1`;
      await tx
        .update(spaces)
        .set({
          status: "archived",
          leaseEpoch: cerca,
          managementRevision: gestao,
          rightsOperationId: operacao.id,
          rightsFrozenState: recreioRightsWorldProjection({
            ...spaces,
            status: sql`'archived'`,
            leaseEpoch: cerca,
            managementRevision: gestao,
          }),
          updatedAt: AGORA,
        })
        .where(eq(spaces.id, mundo.id));
    }
    await tx
      .update(devices)
      .set({ revokedAt: AGORA })
      .where(
        and(
          eq(devices.kind, "paired_device"),
          inArray(devices.activeProfileId, ids),
          isNull(devices.revokedAt),
        ),
      );
    await encerrarSessoesAbertas(tx, inArray(games.profileId, ids), "permissions_changed", {
      porQuem: "ator",
      contaId: autor.contaId,
    });
    await logAuditEventStrict(
      "recreio.rights_consented",
      autor.contaId,
      {
        app: "recreio",
        operationId: operacao.id,
        kind: plano.tipo,
        profileCount: ids.length,
        worldCount: mundos.length,
      },
      { writer: tx },
    );
    await nativa.conferirPrazo(autor.login);
    return recibo(operacao);
  });
}
