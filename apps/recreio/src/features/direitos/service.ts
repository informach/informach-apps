import "server-only";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { copiarCadastroPessoalNoBanco } from "./cadastro-repository";
import {
  PedidoDeCadastroPessoalSchema,
  PedidoDeCopiaDoJogoSchema,
  PedidoDeInventarioPessoalSchema,
} from "./contrato";
import { copiarDadosPessoaisDoJogo } from "./dados-repository";
import { listarJogosPessoaisNoBanco } from "./inventario-repository";
import {
  PedidoDePreparacaoDeDireitosSchema,
  ReferenciaDaPreparacaoSchema,
} from "./preparacao-contrato";
import { cancelarPreparacaoNoBanco, prepararDireitosNoBanco } from "./preparacao-repository";

export async function prepararPedidoDeDireitos(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = PedidoDePreparacaoDeDireitosSchema.parse(entrada);
  await limitarTentativas({
    chave: `previa-direitos:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return prepararDireitosNoBanco(autor, pedido);
}

export async function cancelarPreviaDeDireitos(autor: AutorNativoRecente, entrada: unknown) {
  const referencia = ReferenciaDaPreparacaoSchema.parse(entrada);
  await limitarTentativas({
    chave: `cancelar-previa-direitos:${autor.contaId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return cancelarPreparacaoNoBanco(autor, referencia);
}

export async function prepararCopiaDoCadastroPessoal(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = PedidoDeCadastroPessoalSchema.parse(entrada);
  await limitarTentativas({
    chave: `copia-cadastro-pessoal:${autor.contaId}`,
    max: 10,
    janelaEmSegundos: 600,
  });
  return copiarCadastroPessoalNoBanco(autor, pedido.perfilId);
}

export async function listarJogosComDadosPessoais(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = PedidoDeInventarioPessoalSchema.parse(entrada);
  await limitarTentativas({
    chave: `inventario-pessoal-jogo:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return listarJogosPessoaisNoBanco(autor, pedido.perfilId, pedido.apos);
}

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
