import type { ModuloDoJogo } from "@informach/recreio/sdk";

/**
 * Como baixar o cliente de cada jogo que a página `/jogar/<jogo>` sabe montar:
 * id do jogo para a função que traz o módulo. O `import()` é dinâmico de
 * propósito: o código de um jogo só chega ao navegador de quem abre aquele
 * jogo, e nunca entra no bundle comum do portal.
 *
 * **Só o hospedeiro (`components/hospedeiro.tsx`) importa este arquivo.** O
 * servidor pergunta a `registro.ts`, que só tem os ids: se uma página de
 * servidor importasse daqui, o Next seguiria o `import()` e tentaria compilar
 * o cliente do jogo (React com estado, three.js) como componente de servidor.
 *
 * O portal não importa o pacote de um jogo em nenhum outro lugar: cada linha
 * aponta para um adaptador de `adaptadores/`, que traduz
 * `montar(host, contexto, opcoes)` para a função de montagem do pacote do jogo.
 */
export type Carregador = () => Promise<ModuloDoJogo>;

const CLIENTES: Record<string, Carregador> = {
  morada: () => import("./adaptadores/morada").then((m) => m.morada),
};

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
