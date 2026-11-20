import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioRightsRecoveryRuns as runs,
  recreioRightsRecoverySources as sources,
  users,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import {
  lerPlanoHistoricoRecuperado,
  lerPreparacaoInterativaDaOperacao,
} from "@/features/direitos/fonte-intencao-repository";
import { criarAssinaturaDoLivro, resumoDoRegistro } from "@/features/direitos/livro/assinatura";
import { PlanoDeDireitosSchema } from "@/features/direitos/preparacao-contrato";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { codigoDoBanco, novoJogador } from "./apoio";
import { mundoDe } from "./jogo-apoio";
import { familiaSocial } from "./social-apoio";

it("conserva origem histórica sem criar solicitante ou mundo e recusa usar a fonte pela execução interativa", async () => {
  const familia = await familiaSocial(),
    host = await novoJogador(),
    mundo = await mundoDe(host);
  const [perfilAntes] = await db.select().from(profiles).where(eq(profiles.id, familia.perfil.id));
  const [guarda] = await db
    .select()
    .from(guardians)
    .where(eq(guardians.profileId, familia.perfil.id));
  if (!perfilAntes || !guarda) throw new Error("Native minor record absent");
  const ausente = randomUUID(),
    mundoAusente = randomUUID(),
    id = randomUUID(),
    runId = randomUUID();
  const assinatura = criarAssinaturaDoLivro({
    livroId: randomUUID(),
    chaveAtiva: "history-fixture",
    chaves: new Map([["history-fixture", randomBytes(32)]]),
  });
  // Historical storage fixtures with genuine MAC bytes, not proof of a native
  // consent, external frozen prefix, offline erasure or restored traffic.
  const plano = PlanoDeDireitosSchema.parse({
    formato: "recreio-previa-direitos-v1",
    tipo: "retirar_perfil",
    contaId: ausente,
    perfis: [
      {
        id: familia.perfil.id,
        tipo: "minor",
        versao: perfilAntes.policyVersion,
        responsabilidadeId: guarda.id,
      },
    ],
    mundos: [mundo, mundoAusente].sort().map((id) => ({
      id,
      jogo: "morada",
      revisao: 0,
      diario: 0,
      gestao: 1,
      cerca: 0,
      estado: "hibernating",
      outrosParticipantes: 1,
    })),
    identidadeGlobalPreservada: true,
    financeiroSeparado: true,
  });
  const mapa = plano.mundos.map((m) => ({
    mundoReferencia: m.id,
    jogo: m.jogo,
    mundoVivoId: m.id === mundo ? mundo : null,
  }));
  const planoSha = createHash("sha256").update(JSON.stringify(plano)).digest("hex"),
    agora = new Date(),
    consentida = new Date(agora.getTime() - 60_000),
    cerca = "a".repeat(64);
  const bytes = assinatura.assinarIntencao({
    formato: "recreio-intencao-direitos-v1",
    livroId: assinatura.livroId,
    operacaoId: id,
    revisao: 1,
    epoca: 0,
    tipo: plano.tipo,
    contaId: ausente,
    perfilIds: [familia.perfil.id],
    planoSha256: planoSha,
    consentidaEm: consentida.toISOString(),
    autenticadaEm: consentida.toISOString(),
    fonte: "f".repeat(40),
  });
  let gravada = false;
  try {
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, ausente))).toHaveLength(
      0,
    );
    await db.insert(runs).values({
      id: runId,
      ledgerId: assinatura.livroId,
      frozenHeadSha256: cerca,
      captureSha256: "b".repeat(64),
      frozenEpoch: 0,
      frozenSigningKeyId: "history-fixture",
      nextSigningKeyId: "history-next",
      source: "f".repeat(40),
    });
    await db.insert(sources).values({
      operationId: id,
      runId,
      ledgerId: assinatura.livroId,
      requesterReference: ausente,
      kind: plano.tipo,
      planSha256: planoSha,
      plan: plano,
      worldMap: mapa,
    });
    const [op] = await db
      .insert(operations)
      .values({
        id,
        preparationId: null,
        recoverySourceId: id,
        requesterUserId: ausente,
        planSha256: planoSha,
        kind: plano.tipo,
        ledgerId: assinatura.livroId,
        ledgerEpoch: 0,
        signingKeyId: "history-fixture",
        source: "f".repeat(40),
        signedIntent: bytes,
        intentSha256: resumoDoRegistro(bytes),
        authenticatedAt: consentida,
        consentedAt: consentida,
        state: "admitted",
        admittedHeadSha256: cerca,
        admittedAt: agora,
        createdAt: consentida,
        updatedAt: agora,
        nextAttemptAt: agora,
      })
      .returning();
    if (!op) throw new Error("Historical operation absent");
    gravada = true;
    const ler = () => db.transaction((tx) => lerPlanoHistoricoRecuperado(tx, op));
    const lida = await ler();
    expect(lida.plano).toEqual(plano);
    expect(lida.mapa).toEqual(mapa);
    expect(lida.execucaoAutorizada).toBe(false);
    await expect(
      db.transaction((tx) => lerPreparacaoInterativaDaOperacao(tx, op)),
    ).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
    expect(
      await codigoDoBanco(
        db.update(operations).set({ recoverySourceId: null }).where(eq(operations.id, id)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.update(operations).set({ preparationId: randomUUID() }).where(eq(operations.id, id)),
      ),
    ).toBe("23514");
    expect(
      await codigoDoBanco(
        db.update(operations).set({ requesterUserId: randomUUID() }).where(eq(operations.id, id)),
      ),
    ).toBe("23503");
    expect(
      await codigoDoBanco(
        db
          .update(operations)
          .set({ state: "publishing", admittedHeadSha256: null, admittedAt: null })
          .where(eq(operations.id, id)),
      ),
    ).toBe("23514");
    await db
      .update(sources)
      .set({ worldMap: mapa.filter((m) => m.mundoReferencia !== mundoAusente) })
      .where(eq(sources.operationId, id));
    await expect(ler()).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
    await db
      .update(sources)
      .set({ worldMap: mapa.map((m) => ({ ...m, mundoVivoId: null })) })
      .where(eq(sources.operationId, id));
    await expect(ler()).rejects.toMatchObject({ code: "DIREITOS_INTEGRIDADE" });
    await db.update(sources).set({ worldMap: mapa }).where(eq(sources.operationId, id));
    expect((await ler()).execucaoAutorizada).toBe(false);
    await expect(
      prepararPedidoDeDireitos(familia.autor, {
        pedidoId: id,
        tipo: "retirar_perfil",
        perfis: [familia.perfil.id],
      }),
    ).rejects.toMatchObject({ code: "CONFLITO" });
    const nova = await prepararPedidoDeDireitos(familia.autor, {
      pedidoId: randomUUID(),
      tipo: "retirar_perfil",
      perfis: [familia.perfil.id],
    });
    expect(nova.preparacaoId).not.toBe(id);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, ausente))).toHaveLength(
      0,
    );
    expect((await db.select().from(profiles).where(eq(profiles.id, familia.perfil.id)))[0]).toEqual(
      perfilAntes,
    );
  } finally {
    bytes.fill(0);
    assinatura.encerrar();
    if (gravada)
      await db
        .update(operations)
        .set({ state: "review", reviewCode: "dependency" })
        .where(eq(operations.id, id));
  }
});
