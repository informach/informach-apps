import "server-only";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { limitarTentativas } from "@/lib/rate-limit";
import { codigoDoPostgres, constraintDoPostgres } from "@/lib/repository";
import { aceitarPedidoNoBanco, aprovarPedidoNoBanco } from "./aceite-repository";
import { gravarCodigoDeAmigo } from "./codigos-repository";
import { criarPedidoDeAmizade } from "./pedidos-repository";
import { AprovacaoDeAmizadeSchema, NovoPedidoDeAmizadeSchema } from "./regras";
import { hashDoCodigoDeAmigo, novoCodigoDeAmigo } from "./segredos";

export async function emitirCodigoDeAmigo(referencia: ReferenciaDeJogador) {
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
export async function pedirAmizade(referencia: ReferenciaDeJogador, entrada: unknown) {
  const pedido = NovoPedidoDeAmizadeSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-pedido:${referencia.perfilId}`,
    max: 20,
    janelaEmSegundos: 3600,
  });
  return criarPedidoDeAmizade(referencia, pedido);
}

export async function aceitarAmizade(referencia: ReferenciaDeJogador, pedidoId: unknown) {
  const id = z.uuid().parse(pedidoId);
  await limitarTentativas({
    chave: `social-aceite:${referencia.perfilId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aceitarPedidoNoBanco(referencia, id);
}
export async function aprovarAmizade(autor: AutorNativoRecente, entrada: unknown) {
  const pedido = AprovacaoDeAmizadeSchema.parse(entrada);
  await limitarTentativas({
    chave: `social-aprovacao:${autor.contaId}`,
    max: 30,
    janelaEmSegundos: 600,
  });
  return aprovarPedidoNoBanco(autor, pedido);
}
