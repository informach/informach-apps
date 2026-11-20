import "server-only";
import type { StripeMode } from "@informach/config";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { conferirAutorDeDireitosNoBanco } from "./autoridade-repository";
import { AceiteDoEncerramentoSchema } from "./encerramento-contrato";
import type { criarArmazenamentoDoLivro } from "./livro/armazenamento";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { conferirPrefixoDoLivro } from "./livro/leitura";
import { PedidoDePreparacaoDeDireitosSchema } from "./preparacao-contrato";
import { prepararEncerramentoNoBanco } from "./preparacao-repository";
import { consentirEncerramentoNoBanco } from "./retirada-consentimento-repository";

export async function prepararPedidoDeEncerramento(
  autor: AutorNativoRecente,
  entrada: unknown,
  modo: StripeMode,
) {
  const pedido = PedidoDePreparacaoDeDireitosSchema.parse(entrada);
  assertAllowed(
    pedido.tipo === "encerrar_conta",
    "ESCOPO",
    "Selecione o encerramento da participação.",
  );
  await limitarTentativas({
    chave: `previa-direitos:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return prepararEncerramentoNoBanco(autor, pedido, modo);
}

/** Explicit reduction consent. Runtime mode, key, ledger and immutable source
 * are server composition; none of them may come from the form. */
export async function confirmarEncerramentoDeConta(
  autor: AutorNativoRecente,
  entrada: unknown,
  config: {
    assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
    storage: ReturnType<typeof criarArmazenamentoDoLivro>;
    fonte: string;
    modo: StripeMode;
  },
) {
  const pedido = AceiteDoEncerramentoSchema.parse(entrada);
  await limitarTentativas({
    chave: `consentimento-direitos:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  await conferirAutorDeDireitosNoBanco(autor);
  const prova = await conferirPrefixoDoLivro({
    storage: config.storage,
    maxEntradas: 100_000,
    tempoLimiteMs: 30_000,
  }).catch(() => {
    throw new AppError(
      "DIREITOS_INDISPONIVEIS",
      "Não foi possível conferir o pedido. Tente novamente.",
    );
  });
  assertAllowed(
    prova.cabecalho.documento.livroId === config.assinatura.livroId &&
      prova.cabecalho.documento.estado === "aberto" &&
      prova.cabecalho.chaveId === config.assinatura.chaveAtiva,
    "DIREITOS_INDISPONIVEIS",
    "O encerramento está temporariamente indisponível. Nenhuma nova confirmação foi registrada.",
  );
  return consentirEncerramentoNoBanco(autor, pedido, {
    assinatura: config.assinatura,
    fonte: config.fonte,
    epoca: prova.cabecalho.documento.epoca,
    modo: config.modo,
  });
}
