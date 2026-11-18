import "server-only";
import { NovoConviteDeVisitaSchema } from "@informach/recreio/contrato";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { limitarTentativas } from "@/lib/rate-limit";
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
