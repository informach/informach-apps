import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@informach/db";
import { customers } from "@informach/db/schema";
import { criarProcessadorFinanceiroDoEncerramento } from "@/features/direitos/encerramento-financeiro-execucao-service";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { criarAssinaturaDoLivro } from "@/features/direitos/livro/assinatura";
import { RAIZ_VAZIA } from "@/features/direitos/livro/contrato";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { PedidoDePreparacaoDeDireitosSchema } from "@/features/direitos/preparacao-contrato";
import { prepararEncerramentoNoBanco } from "@/features/direitos/preparacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirEncerramentoNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { gravarPinNativo } from "@/features/protecao/repository";
import { gerarHashDoPin } from "@/features/protecao/segredos";
import { criarInventarioFinanceiroDeProva } from "../scripts/backup/inventario-financeiro-prova";
import { exigir } from "../scripts/backup/provas-arquivos";
import type { criarBucketDaMontagem } from "./backup-provider-apoio";
import { interromperPublicacaoDeEncerramento } from "./backup-publicacao-encerramento-apoio";
import { prepararSelecaoDoEncerramento } from "./backup-selecao-encerramento-apoio";
import { pagamentoParaEncerramento } from "./encerramento-financeiro-apoio";
import { adultoDoTeste } from "./teste-apoio";

/** Native synthetic closures: historical no-customer and closed-HTTP customer
 * confirmations, plus a pending adult/minor selection with opaque data.
 * Consent/authority are real native domain operations; no live payment or
 * provider credential is used and the worker receives no global pool. */
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
    let publicacaoPendenteId: string | undefined;
    async function admitir(
      entrada?: Pick<Awaited<ReturnType<typeof adultoDoTeste>>, "conta" | "autor">,
      comPin = false,
      perfis: readonly string[] = [],
      interromper = false,
    ) {
      const adulto = entrada ?? (await adultoDoTeste());
      if (comPin) await gravarPinNativo(adulto.autor, await gerarHashDoPin("482731"));
      const previa = await prepararEncerramentoNoBanco(
        adulto.autor,
        PedidoDePreparacaoDeDireitosSchema.parse({
          pedidoId: randomUUID(),
          tipo: "encerrar_conta",
          perfis: [...perfis].sort(),
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
      if (interromper)
        await interromperPublicacaoDeEncerramento({ assinatura, storage }, recibo.operacaoId);
      else {
        let publicada = await publicarProximoConsentimento({ assinatura, storage });
        if (
          publicada.situacao === "admitida" &&
          publicada.operacaoId === publicacaoPendenteId &&
          publicada.operacaoId !== recibo.operacaoId
        )
          publicada = await publicarProximoConsentimento({ assinatura, storage });
        exigir(
          publicada.situacao === "admitida" && publicada.operacaoId === recibo.operacaoId,
          "CONSENTIMENTO_NATIVO_DIVERGENTE",
        );
      }
      return { operacaoId: recibo.operacaoId, contaId: adulto.conta.id };
    }
    const anterior = await admitir(undefined, true);
    const processar = criarProcessadorFinanceiroDoEncerramento({
      livroId,
      obterCoordenacao: async () => ({
        assinatura,
        prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 10, tempoLimiteMs: 15000 }),
      }),
      obterRuntime: () => {
        throw new Error("Synthetic no-customer closure must not compose Stripe");
      },
    });
    exigir((await processar()).situacao === "confirmada", "CONSENTIMENTO_NATIVO_DIVERGENTE");
    const pagante = await adultoDoTeste(),
      clienteStripeId = `cus_recovery_${randomUUID().replaceAll("-", "")}`;
    await db.insert(customers).values({
      provider: "stripe",
      providerCustomerId: clienteStripeId,
      subjectType: "user",
      subjectId: pagante.conta.id,
      app: "recreio",
      email: pagante.conta.email,
    });
    const provedor = await admitir(pagante, true);
    const http = await criarInventarioFinanceiroDeProva({
      contaId: pagante.conta.id,
      clienteStripeId,
    });
    try {
      const confirmar = criarProcessadorFinanceiroDoEncerramento({
        livroId,
        obterCoordenacao: async () => ({
          assinatura,
          prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 10, tempoLimiteMs: 15000 }),
        }),
        obterRuntime: () => ({ modo: "dev", inventario: http.inventario }),
      });
      exigir((await confirmar()).situacao === "confirmada", "CONSENTIMENTO_NATIVO_DIVERGENTE");
      http.conferir();
    } finally {
      await http.encerrar();
    }
    const pagamento = await pagamentoParaEncerramento();
    const reciboContrato = await admitir(pagamento.adulto, true);
    const itemPago = pagamento.financeiro.assinatura.items.data[0],
      checkoutPago = pagamento.sessions[0];
    exigir(itemPago && checkoutPago?.status === "complete", "CONTRATO_NATIVO_DIVERGENTE");
    const comContrato = {
      ...reciboContrato,
      clienteStripeId: pagamento.providerCustomerId,
      assinaturaStripeId: pagamento.financeiro.assinatura.id,
      compraId: pagamento.recibo.id,
      checkoutStripeId: checkoutPago.id,
      inicio: itemPago.current_period_start,
      fim: itemPago.current_period_end,
    };
    const { familia, perfisSelecionados, mundo } = await prepararSelecaoDoEncerramento();
    const pendente = await admitir(familia, false, perfisSelecionados);
    const publicacaoPendente = await admitir(undefined, true, [], true);
    publicacaoPendenteId = publicacaoPendente.operacaoId;
    const adultaPosterior = await adultoDoTeste();
    await gravarPinNativo(adultaPosterior.autor, await gerarHashDoPin("482731"));
    const selecaoPosterior = await prepararSelecaoDoEncerramento();
    const adultaCliente = await adultoDoTeste(),
      clientePosteriorId = `cus_recovery_${randomUUID().replaceAll("-", "")}`;
    await gravarPinNativo(adultaCliente.autor, await gerarHashDoPin("482731"));
    await db.insert(customers).values({
      provider: "stripe",
      providerCustomerId: clientePosteriorId,
      subjectType: "user",
      subjectId: adultaCliente.conta.id,
      app: "recreio",
      email: adultaCliente.conta.email,
    });
    return {
      async publicar() {
        const posterior = await admitir(adultaPosterior);
        const reciboSelecionado = await admitir(
          selecaoPosterior.familia,
          false,
          selecaoPosterior.perfisSelecionados,
        );
        const reciboCliente = await admitir(adultaCliente);
        await storage.congelarCabecalho(await storage.lerCabecalho(), new Date().toISOString());
        return {
          livroId,
          operacaoId: pendente.operacaoId,
          contaId: pendente.contaId,
          perfisSelecionados,
          mundo,
          publicacaoPendente,
          posterior,
          posteriorComSelecao: {
            ...reciboSelecionado,
            perfisSelecionados: selecaoPosterior.perfisSelecionados,
            mundo: selecaoPosterior.mundo,
          },
          posteriorComCliente: { ...reciboCliente, clienteStripeId: clientePosteriorId },
          comContrato,
          anterior,
          provedor: { ...provedor, clienteStripeId },
          chaves: {
            "finance-old": antiga.toString("base64"),
            "finance-next": proxima.toString("base64"),
          },
        };
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
