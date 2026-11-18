import "server-only";
import type { PerfilId } from "@informach/recreio";
import {
  AprovacaoDoMundoParaVisitaSchema,
  AprovacaoParentalDeVisitaSchema,
  EncerramentoParentalDeVisitaSchema,
  NovoConviteDeVisitaSchema,
  RespostaAConviteDeVisitaSchema,
} from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { aprovarVisitaPeloMundo, aprovarVisitaPeloResponsavel } from "./aprovacoes-repository";
import { gravarConviteDeVisita, recuperarTentativaDeVisita } from "./emissao-repository";
import {
  encerrarConviteDeVisitaNoBanco,
  encerrarVisitaPeloResponsavel,
} from "./reducao-repository";
import { aceitarConviteDeVisitaNoBanco, recuperarDecisaoConcluida } from "./resposta-repository";

export async function emitirConviteDeVisita(autor: AutorDeMundos, entrada: unknown) {
  const pedido = NovoConviteDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-emissao:${autor.perfilId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  const anterior = await recuperarTentativaDeVisita(autor, pedido);
  return anterior ?? gravarConviteDeVisita(autor, pedido);
}

export async function aprovarVisitaDoMenor(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = AprovacaoParentalDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-aprovacao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aprovarVisitaPeloResponsavel(autor, pedido);
}
export async function aprovarVisitaDoMundo(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  entrada: unknown,
) {
  const pedido = AprovacaoDoMundoParaVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-aprovacao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aprovarVisitaPeloMundo(autor, perfilId, pedido);
}

export async function responderConviteDeVisita(autor: AutorDeMundos, entrada: unknown) {
  const pedido = RespostaAConviteDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-resposta:${autor.perfilId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  if (pedido.acao !== "aceitar")
    return encerrarConviteDeVisitaNoBanco(autor, pedido.conviteId, pedido.acao);
  const anterior = await recuperarDecisaoConcluida(autor, pedido.conviteId);
  return anterior ?? aceitarConviteDeVisitaNoBanco(autor, pedido.conviteId);
}
export async function encerrarVisitaDoMenor(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = EncerramentoParentalDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-reducao-parental:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return encerrarVisitaPeloResponsavel(autor, pedido.perfilId, pedido.conviteId);
}
