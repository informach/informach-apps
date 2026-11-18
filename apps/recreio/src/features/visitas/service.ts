import "server-only";
import type { PerfilId } from "@informach/recreio";
import {
  AprovacaoDoMundoParaVisitaSchema,
  AprovacaoParentalDeVisitaSchema,
  NovoConviteDeVisitaSchema,
} from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { aprovarVisitaPeloMundo, aprovarVisitaPeloResponsavel } from "./aprovacoes-repository";
import { gravarConviteDeVisita, recuperarTentativaDeVisita } from "./emissao-repository";

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
