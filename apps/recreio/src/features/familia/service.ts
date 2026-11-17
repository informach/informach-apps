import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { CadastroDeMenorSchema } from "./regras";
import { confirmarCadastroDeMenor, prepararCadastroDeMenor } from "./repository";

export async function prepararPerfilMenor(autor: AutorNativoRecente) {
  await limitarTentativas({
    chave: `preparar-menor:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return prepararCadastroDeMenor(autor);
}

export async function cadastrarPerfilMenor(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = CadastroDeMenorSchema.parse(entrada);
  await limitarTentativas({
    chave: `cadastrar-menor:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 3600,
  });
  return confirmarCadastroDeMenor(autor, pedido);
}
