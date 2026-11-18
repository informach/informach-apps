import "server-only";
import { MundoIdSchema } from "@informach/recreio";
import {
  EncerramentoDeSessaoDeVisitaSchema,
  SessaoDeVisitaEncerradaSchema,
} from "@informach/recreio/contrato";
import type { Host } from "@/features/posse/service";
import { limitarTentativas } from "@/lib/rate-limit";
import { encerrarSessaoDeVisitaNoBanco } from "./encerramento-repository";

export async function encerrarSessaoDeVisita(host: Host, mundoId: unknown, entrada: unknown) {
  const mundo = MundoIdSchema.parse(mundoId),
    pedido = EncerramentoDeSessaoDeVisitaSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-encerramento:${host.instanciaId}`,
    max: 240,
    janelaEmSegundos: 60,
  });
  return SessaoDeVisitaEncerradaSchema.parse(
    await encerrarSessaoDeVisitaNoBanco(host, mundo, pedido),
  );
}
