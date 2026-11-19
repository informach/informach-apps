import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { db, eq } from "@informach/db";
import {
  recreioAccountClosureFinances as finances,
  recreioSpaceMembers as members,
  recreioRightsOperations as operations,
  recreioProfiles as profiles,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { criarMundo } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { VERSAO_DA_RESPONSABILIDADE } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { concluirProximaRetirada } from "@/features/direitos/conclusao-repository";
import { concluirProximaDrenagem } from "@/features/direitos/drenagem-repository";
import { minimizarProximoPerfil } from "@/features/direitos/minimizacao-repository";
import { expurgarProximaReferencia } from "@/features/direitos/referencias-retidas-repository";
import { cadastrarPerfilMenor, prepararPerfilMenor } from "@/features/familia/service";
import { processarProximaFotografiaDeDireitos } from "../scripts/direitos/fotografias";
import { livroDoEncerramento } from "./encerramento-financeiro-apoio";
import { adultoDoTeste } from "./teste-apoio";

describe("encerramento: efeitos pessoais dependem da confirmação financeira original", () => {
  it("trata dois perfis e todas as fotos sem liberar o mundo antes do último, preservando terceiro", async () => {
    const adulto = await adultoDoTeste(true),
      terceiro = await adultoDoTeste(true);
    if (!adulto.jogador || !terceiro.jogador) throw new Error("Native players absent");
    const proprio = adulto.jogador.perfil,
      outro = terceiro.jogador.perfil;
    const cadastro = await prepararPerfilMenor(adulto.autor);
    const { perfil: menor } = await cadastrarPerfilMenor(adulto.autor, {
      intencaoId: cadastro.id,
      perfil: { apelido: "Criança privada", avatar: "padrao" },
      nascimento: { ano: new Date().getUTCFullYear() - 8, mes: 1 },
      assumoResponsabilidade: true,
      versaoDaDeclaracao: VERSAO_DA_RESPONSABILIDADE,
    });
    const [mundo] = await db
      .insert(spaces)
      .values({
        gameId: "morada",
        name: "Nome pessoal",
        contentPolicy: "family",
        createdByProfileId: proprio.id,
        stewardProfileId: outro.id,
        leaseEpoch: 1,
      })
      .returning();
    if (!mundo) throw new Error("Native world absent");
    await db.insert(members).values([
      { spaceId: mundo.id, profileId: proprio.id, role: "member", state: "active" },
      { spaceId: mundo.id, profileId: menor.id, role: "member", state: "active" },
      { spaceId: mundo.id, profileId: outro.id, role: "steward", state: "active" },
    ]);
    const simulacao = criarMundo({
      mundoId: mundo.id,
      semente: 42,
      definicao: BAIRRO_DA_PROVA,
      fundadores: [proprio.id, menor.id, outro.id],
    });
    const foto = simulacao.fotografar(),
      bytes = gzipSync(JSON.stringify(foto));
    for (const revision of [1, 2])
      await db.insert(snapshots).values({
        spaceId: mundo.id,
        revision,
        fence: 1,
        schemaVersion: foto.estado.versao,
        journalSeq: 0,
        tick: foto.tick,
        kind: revision === 1 ? "pinned" : "hibernate",
        storage: "pg",
        data: bytes,
        byteSize: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    await db
      .update(spaces)
      .set({ revision: 2, schemaVersion: foto.estado.versao })
      .where(eq(spaces.id, mundo.id));
    const [antesDoTerceiro] = await db.select().from(profiles).where(eq(profiles.id, outro.id));
    const livro = await livroDoEncerramento(adulto.autor, () => {
      throw new Error("No historical customer");
    }, [proprio.id, menor.id]);
    const config = {
      assinatura: livro.assinatura,
      storage: livro.storage,
      leitor: null,
      politica: { retirarTextosDaFundacao: true },
    };
    try {
      expect(await concluirProximaDrenagem(await livro.coordenar())).toMatchObject({
        situacao: "ociosa",
      });
      expect(await processarProximaFotografiaDeDireitos(config)).toMatchObject({
        situacao: "ociosa",
      });
      expect(await minimizarProximoPerfil(await livro.coordenar())).toMatchObject({
        situacao: "ociosa",
      });
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      // No lease existed at consent: the native freeze already fenced the
      // world. The drainer correctly has no pending save to wait for.
      expect(await concluirProximaDrenagem(await livro.coordenar())).toMatchObject({
        situacao: "ociosa",
      });
      expect(
        (await db.select().from(worlds).where(eq(worlds.operationId, livro.recibo.operacaoId)))[0],
      ).toMatchObject({ phase: "frozen" });
      for (let n = 0; n < 2; n++)
        expect(await processarProximaFotografiaDeDireitos(config)).toMatchObject({
          situacao: "fotografia_processada",
        });
      expect(await processarProximaFotografiaDeDireitos(config)).toMatchObject({
        situacao: "dependencias",
      });
      expect(await minimizarProximoPerfil(await livro.coordenar())).toMatchObject({
        situacao: "perfil_minimizado",
      });
      expect((await db.select().from(spaces).where(eq(spaces.id, mundo.id)))[0]).toMatchObject({
        status: "archived",
        rightsOperationId: livro.recibo.operacaoId,
      });
      expect(
        (await db.select().from(worlds).where(eq(worlds.operationId, livro.recibo.operacaoId)))[0],
      ).toMatchObject({ phase: "dependencies", completedAt: null });
      expect(await expurgarProximaReferencia(await livro.coordenar())).toMatchObject({
        situacao: "ociosa",
      });
      expect(await minimizarProximoPerfil(await livro.coordenar())).toMatchObject({
        situacao: "perfil_minimizado",
      });
      expect((await db.select().from(spaces).where(eq(spaces.id, mundo.id)))[0]).toMatchObject({
        status: mundo.status,
        rightsOperationId: null,
        createdByProfileId: null,
        stewardProfileId: outro.id,
        name: "Mundo preservado",
        revision: 2,
        journalSeq: 0,
      });
      expect(
        (await db.select().from(worlds).where(eq(worlds.operationId, livro.recibo.operacaoId)))[0],
      ).toMatchObject({ phase: "completed", completedAt: expect.any(Date) });
      expect((await db.select().from(profiles).where(eq(profiles.id, outro.id)))[0]).toEqual(
        antesDoTerceiro,
      );
      const novas = await db.select().from(snapshots).where(eq(snapshots.spaceId, mundo.id));
      expect(novas).toHaveLength(2);
      for (const nova of novas) {
        if (!nova.data) throw new Error("Transformed native snapshot absent");
        const texto = gunzipSync(nova.data).toString("utf8");
        expect(texto).not.toContain(proprio.id);
        expect(texto).not.toContain(menor.id);
        expect(texto).toContain(outro.id);
        expect(nova.schemaVersion).toBe(foto.estado.versao);
        expect(nova.sha256).toBe(createHash("sha256").update(nova.data).digest("hex"));
      }
      // Profile effects are not the account-domain cleanup or its final receipt.
      expect(await concluirProximaRetirada(await livro.coordenar())).toMatchObject({
        situacao: "ociosa",
      });
      expect(
        (await db.select().from(operations).where(eq(operations.id, livro.recibo.operacaoId)))[0]
          ?.completedAt,
      ).toBeNull();
    } finally {
      await livro.fechar();
      bytes.fill(0);
    }
  });

  it("recibo financeiro confirmado mas de namespace divergente não autoriza minimização", async () => {
    const adulto = await adultoDoTeste(true);
    if (!adulto.jogador) throw new Error("Own player absent");
    const livro = await livroDoEncerramento(adulto.autor, () => {
      throw new Error("No customer");
    }, [adulto.jogador.perfil.id]);
    try {
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      await db
        .update(finances)
        .set({ providerMode: "prod" })
        .where(eq(finances.operationId, livro.recibo.operacaoId));
      expect(await minimizarProximoPerfil(await livro.coordenar())).toMatchObject({
        situacao: "revisao",
      });
      expect(
        (await db.select().from(profiles).where(eq(profiles.id, adulto.jogador.perfil.id)))[0],
      ).toMatchObject({ userId: adulto.conta.id, nickname: "Adulto do teste" });
    } finally {
      await livro.fechar();
    }
  });
});
