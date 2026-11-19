import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { PedidoDeCopiaDoJogoSchema } from "./contrato";
import { copiarDadosPessoaisDoJogo } from "./dados-repository";

/** Componente da exportação completa; ainda não exposto como download. */
export async function prepararCopiaPessoalDoJogo(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = PedidoDeCopiaDoJogoSchema.parse(entrada);
  await limitarTentativas({
    chave: `copia-pessoal-jogo:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return copiarDadosPessoaisDoJogo(autor, pedido);
}
