import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { conferirAutorDeDireitosNoBanco } from "./autoridade-repository";
import type { criarArmazenamentoDoLivro } from "./livro/armazenamento";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { conferirPrefixoDoLivro } from "./livro/leitura";
import { ConsentimentoDeRetiradaSchema } from "./preparacao-contrato";
import { consentirRetiradaNoBanco } from "./retirada-consentimento-repository";

/** Dependências vêm da composição servidora. Identidade, chave, época e fonte
 * nunca são aceitas do formulário. A autorização é relida após todo I/O. */
export async function confirmarRetiradaDePerfil(
  autor: AutorNativoRecente,
  entrada: unknown,
  config: {
    assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
    storage: ReturnType<typeof criarArmazenamentoDoLivro>;
    fonte: string;
  },
) {
  const pedido = ConsentimentoDeRetiradaSchema.parse(entrada);
  await limitarTentativas({
    chave: `consentimento-direitos:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  // Negar aparelho pareado/contexto infantil/login vencido antes da leitura externa.
  await conferirAutorDeDireitosNoBanco(autor);
  const prova = await conferirPrefixoDoLivro({
    storage: config.storage,
    maxEntradas: 100_000,
    tempoLimiteMs: 30_000,
  }).catch(() => {
    // A fronteira da action não encaminha erros/credenciais do provedor ao Sentry.
    throw new AppError(
      "DIREITOS_INDISPONIVEIS",
      "Não foi possível conferir o pedido. Tente novamente.",
    );
  });
  assertAllowed(
    prova.cabecalho.documento.estado === "aberto" &&
      prova.cabecalho.chaveId === config.assinatura.chaveAtiva,
    "DIREITOS_INDISPONIVEIS",
    "A retirada está temporariamente indisponível. Nenhuma nova confirmação foi registrada.",
  );
  return consentirRetiradaNoBanco(autor, pedido, {
    assinatura: config.assinatura,
    fonte: config.fonte,
    epoca: prova.cabecalho.documento.epoca,
  });
}
