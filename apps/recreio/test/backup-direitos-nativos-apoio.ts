import { createHash, randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { db } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioProfileDataKeys as keys,
  recreioProfileWorldTraces as traces,
  recreioProfileDataVersions as versions,
} from "@informach/db/schema";
import { criarMundo } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";
import { confirmarRetiradaDePerfil } from "@/features/direitos/consentimento-service";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "@/features/direitos/livro/contrato";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { prepararPedidoDeDireitos } from "@/features/direitos/service";
import { exigir } from "../scripts/backup/provas-arquivos";
import type { criarBucketDaMontagem } from "./backup-provider-apoio";
import { familiaSocial } from "./social-apoio";

/** Only synthetic CI data. Family, login and consent use the native services;
 * opaque game payloads are seeded before capture, without inventing authority.
 * The later decision lives in its own durable S3 prefix, outside the dump. */
export async function prepararDireitosPosterioresACaptura(
  bucket: Awaited<ReturnType<typeof criarBucketDaMontagem>>,
  preservadoId: string,
  mundoId: string,
) {
  const familia = await familiaSocial(15),
    livroId = randomUUID(),
    antiga = randomBytes(32),
    proxima = randomBytes(32),
    assinatura = criarAssinaturaDoLivro({
      livroId,
      chaveAtiva: "native-old",
      chaves: new Map([["native-old", antiga]]),
    });
  for (const profileId of [familia.perfil.id, preservadoId]) {
    const [key] = await db
      .insert(keys)
      .values({
        profileId,
        gameId: "historico-privado",
        key: "progresso",
        revision: 1,
      })
      .returning();
    exigir(key, "DADOS_NATIVOS_AUSENTES");
    const bytes = Buffer.from(`conteudo sintetico ${profileId}`);
    try {
      await db.insert(versions).values({
        dataId: key.id,
        profileId,
        gameId: key.gameId,
        baseRevision: 0,
        revision: 1,
        kind: "accepted",
        bytes,
        digest: createHash("sha256").update(bytes).digest("hex"),
      });
      await db.insert(achievements).values({
        profileId,
        gameId: key.gameId,
        achievementId: "primeiro",
        keyHash: createHash("sha256").update(profileId).digest("hex"),
      });
    } finally {
      bytes.fill(0);
    }
  }
  // A privacy trace is historical authorship, never a world membership or
  // permission. The other real player remains the world's native steward.
  await db.insert(traces).values({ profileId: familia.perfil.id, spaceId: mundoId });
  const foto = criarMundo({
    mundoId,
    semente: 42,
    definicao: BAIRRO_DA_PROVA,
    fundadores: [familia.perfil.id, preservadoId],
  }).fotografar();
  return {
    fotografia: {
      bytes: gzipSync(JSON.stringify(foto)),
      versao: foto.estado.versao,
      tick: foto.tick,
    },
    async publicar() {
      await bucket.admitirPrefixo("direitos", livroId);
      const storage = criarArmazenamentoDoLivro({
        cliente: bucket.cliente,
        bucket: bucket.destino.bucketName,
        assinatura,
        tempoLimiteMs: 15000,
      });
      await storage.iniciarCabecalho(
        assinatura.assinarCabecalho({
          formato: "recreio-livro-direitos-v1",
          livroId,
          estado: "aberto",
          epoca: 0,
          chavesUtilizadas: ["native-old"],
          retomada: null,
          geracao: 0,
          entradas: 0,
          raizSha256: RAIZ_VAZIA,
          anteriorSha256: null,
          ultimaIntencao: null,
          atualizadoEm: new Date().toISOString(),
        }),
      );
      const previa = await prepararPedidoDeDireitos(familia.autor, {
        pedidoId: randomUUID(),
        tipo: "retirar_perfil",
        perfis: [familia.perfil.id],
      });
      const fonte = process.env.GITHUB_SHA;
      exigir(fonte && /^[a-f0-9]{40}$/.test(fonte), "FONTE_NATIVA_AUSENTE");
      const pedido = await confirmarRetiradaDePerfil(
        familia.autor,
        {
          preparacaoId: previa.preparacaoId,
          planoSha256: previa.planoSha256,
          confirmoRetirada: true,
        },
        { assinatura, storage, fonte },
      );
      const publicada = await publicarProximoConsentimento({ assinatura, storage });
      exigir(
        publicada.situacao === "admitida" && publicada.operacaoId === pedido.operacaoId,
        "CONSENTIMENTO_NATIVO_NAO_PUBLICADO",
      );
      await storage.congelarCabecalho(await storage.lerCabecalho(), new Date().toISOString());
      return {
        livroId,
        operacaoId: pedido.operacaoId,
        perfilId: familia.perfil.id,
        contaId: familia.conta.id,
        preservadoId,
        mundoId,
        chaves: {
          "native-old": antiga.toString("base64"),
          "native-next": proxima.toString("base64"),
        },
      };
    },
    encerrar() {
      assinatura.encerrar();
      antiga.fill(0);
      proxima.fill(0);
    },
  };
}
