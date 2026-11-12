import type { ModuloDoJogo } from "@informach/recreio/sdk";

/**
 * Os clientes de jogo que a página `/jogar/<jogo>` sabe montar: id do jogo para
 * a função que baixa o módulo. O `import()` é dinâmico de propósito: o código
 * de um jogo só chega ao navegador de quem abre aquele jogo, e nunca entra no
 * bundle comum do portal.
 *
 * Acrescentar um jogo é uma linha aqui e um adaptador pequeno ao lado, que
 * traduz `montar(host, contexto, opcoes)` para a função de montagem do pacote
 * do jogo. O portal não importa o pacote de um jogo em nenhum outro lugar.
 */
export type Carregador = () => Promise<ModuloDoJogo>;

const CLIENTES: Record<string, Carregador> = {};

// O cliente do jogo de teste só entra num build feito com
// `RECREIO_JOGO_DE_TESTE=1` (o `next.config.ts` grava a escolha em
// `RECREIO_CLIENTE_DE_TESTE`). Num build de produção a condição é falsa na
// compilação, e o código do jogo de teste nem é empacotado.
if (process.env.RECREIO_CLIENTE_DE_TESTE === "1")
  CLIENTES.teste = () => import("@/features/jogo-de-teste/cliente").then((m) => m.jogoDeTeste);

/** A função que baixa o cliente do jogo, ou `null` se o portal não tem cliente para ele. */
export function carregadorDoJogo(jogo: string): Carregador | null {
  return Object.hasOwn(CLIENTES, jogo) ? (CLIENTES[jogo] ?? null) : null;
}

/** Se a página `/jogar/<jogo>` existe para este jogo. */
export function temCliente(jogo: string): boolean {
  return carregadorDoJogo(jogo) !== null;
}
