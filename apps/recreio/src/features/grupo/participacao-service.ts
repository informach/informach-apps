import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { RetiradaDeAdultoSchema, SaidaDoGrupoSchema } from "./participacao-regras";
import { retirarAdultoDoGrupoNoBanco, sairDoGrupoNoBanco } from "./participacao-repository";

export async function sairDoGrupo(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = SaidaDoGrupoSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-saida:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return sairDoGrupoNoBanco(autor, pedido);
}
export async function retirarAdultoDoGrupo(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = RetiradaDeAdultoSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-retirada:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return retirarAdultoDoGrupoNoBanco(autor, pedido);
}
