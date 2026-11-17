import "server-only";
import { PerfilIdSchema } from "@informach/recreio";
import { ConsultaSocialSchema, PreferenciaDePresencaSchema } from "@informach/recreio/contrato";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { codigoDoPostgres, constraintDoPostgres } from "@/lib/repository";
import { aceitarPedidoNoBanco, aprovarPedidoNoBanco } from "./aceite-repository";
import type { AutorSocial } from "./autoridade-repository";
import { gravarCodigoDeAmigo } from "./codigos-repository";
import { listarSocialNoBanco } from "./consulta-repository";
import { exigirNovosContatos } from "./disponibilidade";
import { criarPedidoDeAmizade } from "./pedidos-repository";
import { salvarPreferenciaDePresenca } from "./preferencias-repository";
import {
  encerrarPedidoNoBanco,
  removerAmizadeNoBanco,
  salvarProtecaoDeContato,
} from "./protecao-repository";
import { renovarAprovacaoNoBanco } from "./reaprovacao-repository";
import {
  AprovacaoDeAmizadeSchema,
  NovoPedidoDeAmizadeSchema,
  ProtecaoDeContatoSchema,
  RenovacaoDeAmizadeSchema,
} from "./regras";
import { hashDoCodigoDeAmigo, novoCodigoDeAmigo } from "./segredos";

export async function emitirCodigoDeAmigo(referencia: AutorSocial) {
  exigirNovosContatos();
  await limitarTentativas({
    chave: `social-codigo:${referencia.perfilId}`,
    max: 6,
    janelaEmSegundos: 3600,
  });
  const emitir = async () => {
    const codigo = novoCodigoDeAmigo();
    return { ...(await gravarCodigoDeAmigo(referencia, hashDoCodigoDeAmigo(codigo))), codigo };
  };
  try {
    return await emitir();
  } catch (erro) {
    if (
      codigoDoPostgres(erro) !== "23505" ||
      constraintDoPostgres(erro) !== "recreio_friend_code_hash"
    )
      throw erro;
    return emitir();
  }
}
export async function pedirAmizade(referencia: AutorSocial, entrada: unknown) {
  exigirNovosContatos();
  const pedido = NovoPedidoDeAmizadeSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-pedido:${referencia.perfilId}`,
    max: 20,
    janelaEmSegundos: 3600,
  });
  return criarPedidoDeAmizade(referencia, pedido);
}

export async function aceitarAmizade(referencia: AutorSocial, pedidoId: unknown) {
  exigirNovosContatos();
  const id = z.uuid().parse(pedidoId);
  await limitarTentativas({
    chave: `social-aceite:${referencia.perfilId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aceitarPedidoNoBanco(referencia, id);
}
export async function aprovarAmizade(autor: AutorNativoRecente, entrada: unknown) {
  exigirNovosContatos();
  const pedido = AprovacaoDeAmizadeSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-aprovacao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aprovarPedidoNoBanco(autor, pedido);
}
export async function renovarAprovacaoDeAmizade(autor: AutorNativoRecente, entrada: unknown) {
  exigirNovosContatos();
  const pedido = RenovacaoDeAmizadeSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-reaprovacao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return renovarAprovacaoNoBanco(autor, pedido);
}

async function limitarProtecao(referencia: AutorSocial) {
  await limitarTentativas({
    chave: `social-protecao:${referencia.perfilId}`,
    max: 60,
    janelaEmSegundos: 600,
  });
}
export async function protegerContato(referencia: AutorSocial, entrada: unknown) {
  const pedido = ProtecaoDeContatoSchema.parse(entrada);
  await limitarProtecao(referencia);
  return salvarProtecaoDeContato(referencia, pedido);
}
export async function removerAmizade(referencia: AutorSocial, entrada: unknown) {
  const perfilId = PerfilIdSchema.parse(entrada);
  await limitarProtecao(referencia);
  return removerAmizadeNoBanco(referencia, perfilId);
}
export async function encerrarPedidoDeAmizade(referencia: AutorSocial, entrada: unknown) {
  const pedido = z
    .strictObject({ pedidoId: z.uuid(), acao: z.enum(["recusar", "revogar"]) })
    .parse(entrada);
  await limitarProtecao(referencia);
  return encerrarPedidoNoBanco(referencia, pedido.pedidoId, pedido.acao);
}
export async function consultarSocial(autor: AutorSocial, entrada: unknown = {}) {
  const consulta = ConsultaSocialSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-consulta:${autor.perfilId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return listarSocialNoBanco(autor, consulta.apos ?? null);
}
export async function alterarPresencaSocial(autor: AutorSocial, entrada: unknown) {
  const presenca = PreferenciaDePresencaSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-presenca:${autor.perfilId}`,
    max: 20,
    janelaEmSegundos: 600,
  });
  return salvarPreferenciaDePresenca(autor, presenca);
}
