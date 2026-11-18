import "server-only";
import { MundoIdSchema } from "@informach/recreio";
import {
  EntradaDeVisitanteSchema,
  PedidoDeAberturaDeVisitaSchema,
  PedidoDeEntradaDeVisitaSchema,
  VisitaAbertaSchema,
} from "@informach/recreio/contrato";
import type { Host } from "@/features/posse/service";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import { limitarTentativas } from "@/lib/rate-limit";
import { abrirVisitaNoBanco, admitirEntradaDeVisitaNoBanco } from "./entrada-repository";

export async function abrirVisita(autor: SessaoDeJogoAtiva, entrada: unknown) {
  const pedido = PedidoDeAberturaDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-abertura:${autor.perfilId}`,
    max: 30,
    janelaEmSegundos: 60,
  });
  return VisitaAbertaSchema.parse(await abrirVisitaNoBanco(autor, pedido.visitaId));
}
export async function admitirEntradaDeVisita(host: Host, mundoId: unknown, entrada: unknown) {
  const mundo = MundoIdSchema.parse(mundoId),
    pedido = PedidoDeEntradaDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-instancia:${host.instanciaId}`,
    max: 240,
    janelaEmSegundos: 60,
  });
  return EntradaDeVisitanteSchema.parse(await admitirEntradaDeVisitaNoBanco(host, mundo, pedido));
}
