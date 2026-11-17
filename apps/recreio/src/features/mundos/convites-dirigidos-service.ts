import "server-only";
import type { PerfilId } from "@informach/recreio";
import {
  AprovacaoDoMundoParaConviteSchema,
  AprovacaoParentalDeConviteSchema,
  NovoConviteDirigidoSchema,
  RespostaAConviteDirigidoSchema,
} from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { exigirNovosContatos } from "@/features/social/disponibilidade";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  aprovarConvitePeloMundo,
  aprovarConvitePeloResponsavel,
} from "./convites-dirigidos-aprovacoes-repository";
import { gravarConviteDirigido } from "./convites-dirigidos-emissao-repository";
import {
  aceitarConviteDirigidoNoBanco,
  encerrarConviteDirigidoNoBanco,
} from "./convites-dirigidos-resposta-repository";

export async function emitirConviteDirigido(autor: AutorDeMundos, entrada: unknown) {
  exigirNovosContatos();
  const pedido = NovoConviteDirigidoSchema.parse(entrada);
  await limitarTentativas({
    chave: `convite-dirigido-emissao:${autor.perfilId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return gravarConviteDirigido(autor, pedido);
}
export async function responderConviteDirigido(autor: AutorDeMundos, entrada: unknown) {
  const pedido = RespostaAConviteDirigidoSchema.parse(entrada);
  if (pedido.acao === "aceitar") exigirNovosContatos();
  await limitarTentativas({
    chave: `convite-dirigido-resposta:${autor.perfilId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return pedido.acao === "aceitar"
    ? aceitarConviteDirigidoNoBanco(autor, pedido.conviteId)
    : encerrarConviteDirigidoNoBanco(autor, pedido.conviteId, pedido.acao);
}
export async function aprovarConviteDoMenor(autor: AutorNativoRecente, entrada: unknown) {
  exigirNovosContatos();
  const pedido = AprovacaoParentalDeConviteSchema.parse(entrada);
  await limitarTentativas({
    chave: `convite-dirigido-responsavel:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aprovarConvitePeloResponsavel(autor, pedido);
}
export async function aprovarEntradaNoMundo(
  autor: AutorNativoRecente,
  perfilGestorId: PerfilId,
  entrada: unknown,
) {
  exigirNovosContatos();
  const pedido = AprovacaoDoMundoParaConviteSchema.parse(entrada);
  await limitarTentativas({
    chave: `convite-dirigido-gestao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aprovarConvitePeloMundo(autor, perfilGestorId, pedido);
}
