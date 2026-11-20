import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioRightsRecoveryEvaluations as evaluations,
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import {
  conferirOperacaoNaAvaliacao,
  conferirReciboDaAvaliacao,
} from "@/features/direitos/avaliacao-recuperada-repository";
import { confirmarRetiradaDePerfil } from "@/features/direitos/consentimento-service";
import { conferirFonteNativaRecuperada } from "@/features/direitos/fonte-intencao-repository";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { minimizarProximoPerfil } from "@/features/direitos/minimizacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";
import { familiaSocial } from "./social-apoio";

it("confere a origem nativa com cabeçalho ancestral sem reescrever admissão ou autorizar efeitos", async () => {
  const familia = await familiaSocial(15),
    livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  const storage = criarArmazenamentoDoLivro({
    cliente: http.cliente,
    bucket: "recreio-fixture",
    assinatura: livro.assinatura,
    tempoLimiteMs: 2000,
  });
  try {
    await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
    const previa = await prepararPedidoDeDireitos(familia.autor, {
      pedidoId: randomUUID(),
      tipo: "retirar_perfil",
      perfis: [familia.perfil.id],
    });
    const consentida = await confirmarRetiradaDePerfil(
      familia.autor,
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoRetirada: true,
      },
      { assinatura: livro.assinatura, storage, fonte: "a".repeat(40) },
    );
    expect(
      (await publicarProximoConsentimento({ assinatura: livro.assinatura, storage })).situacao,
    ).toBe("admitida");
    const [original] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, consentida.operacaoId)),
      [preparacao] = await db
        .select()
        .from(preparations)
        .where(eq(preparations.id, previa.preparacaoId));
    if (!original || !preparacao) throw new Error("Native consent absent");
    // Staged metadata fixture only. This is not a restored cluster or a grant
    // to execute: native consent/outbox above and external chain are real.
    const cabecalho = await storage.congelarCabecalho(
        await storage.lerCabecalho(),
        new Date().toISOString(),
      ),
      execucaoId = randomUUID();
    await db.insert(runs).values({
      id: execucaoId,
      ledgerId: livro.livroId,
      frozenHeadSha256: cabecalho.sha256,
      captureSha256: "b".repeat(64),
      frozenEpoch: 0,
      frozenSigningKeyId: "v1",
      nextSigningKeyId: "next",
      source: "a".repeat(40),
    });
    await db.insert(sources).values({
      operationId: original.id,
      runId: execucaoId,
      ledgerId: livro.livroId,
      requesterReference: original.requesterUserId,
      kind: original.kind,
      planSha256: original.planSha256,
      plan: preparacao.plan,
      worldMap: [],
    });
    const escopo = { execucaoId, cercaSha256: cabecalho.sha256 },
      ler = () =>
        db.transaction((tx) =>
          conferirFonteNativaRecuperada(tx, original, livro.assinatura, escopo),
        ),
      lida = await ler();
    expect(lida.origemNativaPreservada).toBe(true);
    expect(lida.execucaoAutorizada).toBe(false);
    expect(lida.admissaoPersistida.cabecalhoSha256).toBe(original.admittedHeadSha256);
    expect(lida.admissaoPersistida.cabecalhoSha256).not.toBe(cabecalho.sha256);
    await db.insert(evaluations).values({
      runId: execucaoId,
      operationId: original.id,
      ledgerId: original.ledgerId,
      requesterReference: original.requesterUserId,
      kind: original.kind,
      planSha256: original.planSha256,
      worldMap: [],
    });
    const avaliar = () =>
      db.transaction((tx) => conferirOperacaoNaAvaliacao(tx, original, livro.assinatura, escopo));
    const staged = await avaliar();
    expect(staged.execucaoAutorizada).toBe(false);
    expect(() => conferirReciboDaAvaliacao(staged.avaliacao, original)).toThrow();
    // PostgreSQL itself rejects an incomplete ready receipt. No private
    // cluster capability is being manufactured by this metadata fixture.
    await expect(
      db
        .update(evaluations)
        .set({ state: "ready", origin: "native" })
        .where(eq(evaluations.operationId, original.id)),
    ).rejects.toThrow();
    await db
      .update(evaluations)
      .set({
        state: "ready",
        origin: "native",
        preparationReference: original.preparationId,
        admittedHeadSha256: original.admittedHeadSha256,
        intentSha256: original.intentSha256,
        readyAt: new Date(),
      })
      .where(eq(evaluations.operationId, original.id));
    const pronta = await avaliar();
    expect(() => conferirReciboDaAvaliacao(pronta.avaliacao, original)).not.toThrow();
    await expect(
      db.transaction((tx) =>
        conferirOperacaoNaAvaliacao(tx, original, livro.assinatura, {
          ...escopo,
          execucaoId: randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
    await db
      .update(evaluations)
      .set({ intentSha256: "0".repeat(64) })
      .where(eq(evaluations.operationId, original.id));
    const divergente = await avaliar();
    expect(() => conferirReciboDaAvaliacao(divergente.avaliacao, original)).toThrow();
    await db
      .update(evaluations)
      .set({ intentSha256: original.intentSha256 })
      .where(eq(evaluations.operationId, original.id));
    const prova = await conferirPrefixoDoLivro({
      storage,
      maxEntradas: 10,
      tempoLimiteMs: 10000,
      admissoes: [lida.admissaoPersistida],
    });
    await expect(
      minimizarProximoPerfil({ assinatura: livro.assinatura, prova }),
    ).rejects.toMatchObject({ code: "DIREITOS_LIVRO" });
    await expect(
      db.transaction((tx) =>
        conferirFonteNativaRecuperada(tx, original, livro.assinatura, {
          ...escopo,
          execucaoId: randomUUID(),
        }),
      ),
    ).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
    await db
      .update(sources)
      .set({ worldMap: [{ mundoReferencia: randomUUID(), jogo: "morada", mundoVivoId: null }] })
      .where(eq(sources.operationId, original.id));
    await expect(ler()).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
    const [depois] = await db.select().from(operations).where(eq(operations.id, original.id));
    expect(depois).toEqual(original);
    expect(depois?.preparationId).toBe(previa.preparacaoId);
    expect(depois?.recoverySourceId).toBeNull();
  } finally {
    livro.encerrar();
    await http.fechar();
  }
});
