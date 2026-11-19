import "server-only";
import { z } from "zod";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { consultarMinhaParticipacaoNoRecreio } from "@/features/account/participacao-service";
import { consultarMeuGrupo } from "@/features/grupo/service";
import { segredoStripeCompativel } from "@/lib/commercial-mode";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { AceiteDaCompraSchema, ofertasParaOAdulto } from "./regras";
import { cancelamentoDaRenovacaoDisponivel } from "./renovacao-service";
import {
  consultarMinhaCompraNoBanco,
  consultarSituacaoFinanceiraNoBanco,
  encerrarCompraNaoEnviadaNoBanco,
  prepararCompraNoBanco,
} from "./repository";
import { consultarMinhasTrocasNoBanco } from "./troca-consulta-repository";

/** Somente aceite; não chama Stripe nem concede acesso. */
export async function prepararMinhaCompra(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = AceiteDaCompraSchema.parse(entrada);
  assertAllowed(
    env.RECREIO_BILLING_MODE !== "off",
    "INDISPONIVEL",
    "A compra ainda não está disponível.",
  );
  await limitarTentativas({
    chave: `compra-preparar:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return prepararCompraNoBanco(autor, pedido, env.STRIPE_MODE);
}
export async function consultarMinhaCompra(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `compra-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return consultarMinhaCompraNoBanco(autor);
}
export async function consultarMinhaCobranca(autor: IdentidadeNativa) {
  const participacao = await consultarMinhaParticipacaoNoRecreio(autor);
  const ativa = participacao.estado === "active";
  const compra = await consultarMinhaCompra(autor);
  const financeiro = await consultarSituacaoFinanceiraNoBanco(autor);
  const grupo = ativa ? await consultarMeuGrupo(autor) : null;
  const trocas = await consultarMinhasTrocasNoBanco(autor, env.STRIPE_MODE);
  const configuracaoDeGestao = Boolean(
    segredoStripeCompativel(env.STRIPE_MODE, env.STRIPE_SECRET_KEY) &&
      env.STRIPE_PORTAL_CONFIGURATION_ID?.startsWith("bpc_") &&
      env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),
  );
  return {
    modo: ativa ? env.RECREIO_BILLING_MODE : "off",
    participacaoAtiva: ativa,
    pagamentoDeTeste: env.STRIPE_MODE === "dev",
    compra,
    financeiro: { ...financeiro, podeContratar: ativa && financeiro.podeContratar },
    trocas,
    ofertas: ofertasParaOAdulto(),
    perfis: grupo?.perfis ?? [],
    conferenciaDisponivel: configuracaoDeGestao,
    portalDisponivel: financeiro.temCliente && configuracaoDeGestao,
    cancelamentoDaRenovacaoDisponivel: cancelamentoDaRenovacaoDisponivel(),
    renovacaoNoPortal: env.RECREIO_PORTAL_RENEWAL_MODE === "legacy",
  };
}
export async function encerrarCompraNaoEnviada(autor: IdentidadeNativa, entrada: unknown) {
  const id = z.uuid().parse(entrada);
  await limitarTentativas({
    chave: `compra-encerrar:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return encerrarCompraNaoEnviadaNoBanco(autor, id);
}
