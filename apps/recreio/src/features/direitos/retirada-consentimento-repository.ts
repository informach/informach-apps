import "server-only";
import { isDeepStrictEqual } from "node:util";
import { logAuditEventStrict } from "@informach/auth";
import type { StripeMode } from "@informach/config";
import { and, db, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
  recreioSpaces as spaces,
  users,
} from "@informach/db/schema";
import { z } from "zod";
import {
  type AutorNativoRecente,
  autorizarContaNativaParaDireitos,
} from "@/features/account/autoridade-repository";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { serializarConvitesPorEmail } from "@/features/grupo/convites-email-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import {
  travarComposicaoDeDireitos,
  travarComposicaoDeEncerramento,
} from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, travar } from "@/lib/repository";
import { congelarContaDoEncerramentoLocked } from "./encerramento-congelamento-repository";
import { AceiteDoEncerramentoSchema } from "./encerramento-contrato";
import { mesmoEscopoDeDireitos } from "./escopo";
import { type criarAssinaturaDoLivro, resumoDoRegistro } from "./livro/assinatura";
import { ConsentimentoDeRetiradaSchema } from "./preparacao-contrato";
import { lerPlanoDeDireitos, montarPlanoDeDireitos } from "./preparacao-repository";
import {
  congelarSelecaoDeDireitos,
  inspecionarDrenagemDaSelecao,
} from "./selecao-congelamento-repository";

const Configuracao = z.strictObject({
  fonte: z.string().regex(/^[a-f0-9]{40}$/),
  epoca: z.number().int().min(0).max(15),
});
type Assinatura = ReturnType<typeof criarAssinaturaDoLivro>;
function recibo(linha: typeof operations.$inferSelect) {
  assertAllowed(
    linha.preparationId !== null && linha.recoverySourceId === null,
    "DIREITOS_INTEGRIDADE",
    "Este pedido não é um consentimento interativo.",
  );
  return {
    operacaoId: linha.id,
    preparacaoId: linha.preparationId,
    estado: linha.state,
    consentidaEm: linha.consentedAt.toISOString(),
  };
}

/** Núcleo servidor da retirada de um perfil. Mundos ativos entram em drenagem;
 * nunca toma uma posse ativa nem perde progresso de outro participante.
 * A conta global, cobrança e conteúdo do jogo não são excluídos neste passo. */
export function consentirRetiradaNoBanco(
  autor: AutorNativoRecente,
  entrada: unknown,
  config: { assinatura: Assinatura; fonte: string; epoca: number },
) {
  return consentirPlanoNoBanco(autor, ConsentimentoDeRetiradaSchema.parse(entrada), config);
}

/** Private native coordinator only. Public composition still requires external
 * ledger/key preflight and the explicit three-checkbox account-closure flow. */
export function consentirEncerramentoNoBanco(
  autor: AutorNativoRecente,
  entrada: unknown,
  config: { assinatura: Assinatura; fonte: string; epoca: number; modo: StripeMode },
) {
  const pedido = AceiteDoEncerramentoSchema.parse(entrada);
  return comCicloDeCobranca(autor.contaId, () =>
    consentirPlanoNoBanco(autor, pedido, config, config.modo),
  );
}

function consentirPlanoNoBanco(
  autor: AutorNativoRecente,
  pedido: { preparacaoId: string; planoSha256: string },
  config: { assinatura: Assinatura; fonte: string; epoca: number },
  financeiro?: StripeMode,
) {
  const tipo = financeiro === undefined ? "retirar_perfil" : "encerrar_conta";
  const { fonte, epoca } = Configuracao.parse({ fonte: config.fonte, epoca: config.epoca });
  const { assinatura } = config;
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    let emailDoEncerramento: string | undefined;
    if (financeiro !== undefined) {
      const [pistaDaConta] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, autor.contaId));
      assertAllowed(pistaDaConta, "AUTH", "Entre novamente para continuar.");
      emailDoEncerramento = pistaDaConta.email.trim().toLowerCase();
      await serializarConvitesPorEmail(tx, emailDoEncerramento);
    }
    await travar(tx, `recreio:direitos:preparacao:${pedido.preparacaoId}`);
    const [anterior] = await tx
      .select()
      .from(operations)
      .where(eq(operations.preparationId, pedido.preparacaoId));
    if (anterior) {
      assertAllowed(
        anterior.requesterUserId === autor.contaId &&
          anterior.planSha256 === pedido.planoSha256 &&
          anterior.kind === tipo,
        "DIREITOS",
        "Pedido não disponível.",
      );
      const nativa = await autorizarContaNativaParaDireitos(tx, autor);
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
      plano.tipo === tipo &&
        (financeiro === undefined ||
          (plano.formato === "recreio-previa-encerramento-v2" &&
            plano.financeiro.modo === financeiro)),
      "ESCOPO",
      "Prepare uma prévia compatível com esta operação.",
    );
    const ids = plano.perfis.map((p) => p.id),
      idsMundos = plano.mundos.map((m) => m.id);
    const compor =
      financeiro === undefined ? travarComposicaoDeDireitos : travarComposicaoDeEncerramento;
    await compor(tx, autor.contaId, ids, async (transacao) => {
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
    if (emailDoEncerramento !== undefined) {
      const [contaAtual] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, autor.contaId));
      assertAllowed(
        contaAtual?.email.trim().toLowerCase() === emailDoEncerramento,
        "CONFLITO",
        "A conta mudou. Abra novamente a prévia antes de continuar.",
      );
    }
    // Reconstituir depois das contas/mundos/perfis sob trava, sem adquirir um
    // mundo descoberto tardiamente depois de segurar um perfil.
    const atual = await montarPlanoDeDireitos(
      tx,
      autor,
      {
        pedidoId: pista.id,
        tipo: plano.tipo,
        perfis: ids,
      },
      financeiro,
    );
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
    const nativa = await autorizarContaNativaParaDireitos(tx, autor);
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
    const drenando = await inspecionarDrenagemDaSelecao(tx, ids, mundos);
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
    await congelarSelecaoDeDireitos(tx, {
      operacaoId: operacao.id,
      plano,
      alvos,
      mundos,
      drenando,
    });
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
    await encerrarSessoesAbertas(
      tx,
      idsMundos.length
        ? sql`(${games.profileId} in (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) or ${games.spaceId} in (${sql.join(
            idsMundos.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`
        : inArray(games.profileId, ids),
      "permissions_changed",
      {
        porQuem: "ator",
        contaId: autor.contaId,
      },
    );
    if (financeiro !== undefined) {
      assertAllowed(
        plano.formato === "recreio-previa-encerramento-v2",
        "ESCOPO",
        "Prepare uma nova prévia.",
      );
      await congelarContaDoEncerramentoLocked(tx, plano, operacao.id, agora);
    }
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
