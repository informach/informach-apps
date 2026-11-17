import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { NovoConviteDeGrupoSchema } from "./convites-regras";
import { criarConviteDeGrupo } from "./convites-repository";

export async function convidarAdulto(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = NovoConviteDeGrupoSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-convite:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 3600,
  });
  return criarConviteDeGrupo(autor, pedido);
}
