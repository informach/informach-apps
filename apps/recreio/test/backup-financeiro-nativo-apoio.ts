import { randomBytes, randomUUID } from "node:crypto";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "@/features/direitos/livro/contrato";
import { PedidoDePreparacaoDeDireitosSchema } from "@/features/direitos/preparacao-contrato";
import { prepararEncerramentoNoBanco } from "@/features/direitos/preparacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirEncerramentoNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { exigir } from "../scripts/backup/provas-arquivos";
import type { criarBucketDaMontagem } from "./backup-provider-apoio";
import { adultoDoTeste } from "./teste-apoio";

/** Native synthetic payer without a player or customer. Its pending financial
 * row is captured; the private worker must resume it without a global pool.
 * This is not a live payment, provider inventory or permission to erase data. */
export async function prepararFinanceiroNativoAnterior(
  bucket: Awaited<ReturnType<typeof criarBucketDaMontagem>>,
) {
  const livroId = randomUUID(),
    antiga = randomBytes(32),
    proxima = randomBytes(32),
    assinatura = criarAssinaturaDoLivro({
      livroId,
      chaveAtiva: "finance-old",
      chaves: new Map([["finance-old", antiga]]),
    });
  try {
    const adulto = await adultoDoTeste();
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
        chavesUtilizadas: ["finance-old"],
        retomada: null,
        geracao: 0,
        entradas: 0,
        raizSha256: RAIZ_VAZIA,
        anteriorSha256: null,
        ultimaIntencao: null,
        atualizadoEm: new Date().toISOString(),
      }),
    );
    const previa = await prepararEncerramentoNoBanco(
      adulto.autor,
      PedidoDePreparacaoDeDireitosSchema.parse({
        pedidoId: randomUUID(),
        tipo: "encerrar_conta",
        perfis: [],
      }),
      "dev",
    );
    const recibo = await consentirEncerramentoNoBanco(
      adulto.autor,
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoEncerramento: true,
        confirmoRetiradaDosPerfis: true,
        confirmoCancelamentoDaRenovacao: true,
      },
      { assinatura, fonte: process.env.GITHUB_SHA ?? "f".repeat(40), epoca: 0, modo: "dev" },
    );
    const publicada = await publicarProximoConsentimento({ assinatura, storage });
    exigir(
      publicada.situacao === "admitida" && publicada.operacaoId === recibo.operacaoId,
      "CONSENTIMENTO_NATIVO_DIVERGENTE",
    );
    await storage.congelarCabecalho(await storage.lerCabecalho(), new Date().toISOString());
    return {
      coordenadas: {
        livroId,
        operacaoId: recibo.operacaoId,
        contaId: adulto.conta.id,
        chaves: {
          "finance-old": antiga.toString("base64"),
          "finance-next": proxima.toString("base64"),
        },
      },
      encerrar() {
        assinatura.encerrar();
        antiga.fill(0);
        proxima.fill(0);
      },
    };
  } catch (erro) {
    assinatura.encerrar();
    antiga.fill(0);
    proxima.fill(0);
    throw erro;
  }
}
