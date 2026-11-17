import "server-only";
import type {
  AutorNativoRecente,
  IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { usarCoberturaPropriaNoBanco } from "./cobertura-propria-repository";
import { lerMinhaParticipacao } from "./participacao-consulta-repository";
import {
  CoberturaPropriaSchema,
  RetiradaDeAdultoSchema,
  SaidaDoGrupoSchema,
} from "./participacao-regras";
import { retirarAdultoDoGrupoNoBanco, sairDoGrupoNoBanco } from "./participacao-repository";

export async function consultarMinhaParticipacao(autor: IdentidadeNativa) {
  await limitarTentativas({
    chave: `grupo-participacao-leitura:${autor.contaId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  return lerMinhaParticipacao(autor);
}

export async function usarCoberturaPropria(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = CoberturaPropriaSchema.parse(entrada);
  await limitarTentativas({
    chave: `grupo-cobertura-propria:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return usarCoberturaPropriaNoBanco(autor, pedido);
}

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
