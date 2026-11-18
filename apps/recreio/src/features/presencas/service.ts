import "server-only";
import { ErroDoRecreio, MundoIdSchema } from "@informach/recreio";
import { AtestadoDePresencaSchema } from "@informach/recreio/contrato";
import { jogoQueAbre } from "@/features/jogos/config";
import type { Host } from "@/features/posse/service";
import { env } from "@/lib/env";
import { limitarTentativas } from "@/lib/rate-limit";
import {
  encerrarPresencaNoBanco,
  publicarPresencaNoBanco,
  recuperarReciboDePresenca,
} from "./repository";

export async function atestarPresenca(host: Host, mundoId: unknown, entrada: unknown) {
  const mundo = MundoIdSchema.parse(mundoId),
    pedido = AtestadoDePresencaSchema.parse(entrada);
  await limitarTentativas({
    chave: `presenca-instancia:${host.instanciaId}`,
    max: 240,
    janelaEmSegundos: 60,
  });
  if (pedido.operacao === "sair") return encerrarPresencaNoBanco(host, mundo, pedido);
  const anterior = await recuperarReciboDePresenca(host, mundo, pedido);
  if (anterior) return anterior;
  if (env.RECREIO_VISITS_MODE !== "on" || jogoQueAbre(host.jogo).capacidades.visitas !== true)
    throw new ErroDoRecreio("INDISPONIVEL");
  return publicarPresencaNoBanco(host, mundo, pedido);
}
