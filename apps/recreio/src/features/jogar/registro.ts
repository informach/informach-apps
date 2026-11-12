/**
 * Os jogos que a página `/jogar/<jogo>` sabe montar. Aqui ficam só os ids: é o
 * que o servidor pergunta (a estante, a página de um mundo e a página do
 * jogo), sem carregar código de jogo nenhum. Quem baixa o cliente de cada um
 * é `carregadores.ts`, que só o navegador importa.
 *
 * Acrescentar um jogo é um id aqui, uma linha em `carregadores.ts` e um
 * adaptador pequeno em `adaptadores/`. Os dois arquivos andam juntos:
 * `registro.test.ts` falha se um jogo estiver em um e não no outro.
 */
const COM_CLIENTE: readonly string[] = [
  "morada",
  // O jogo de teste só entra num build feito com `RECREIO_JOGO_DE_TESTE=1` (o
  // `next.config.ts` grava a escolha em `RECREIO_CLIENTE_DE_TESTE`).
  ...(process.env.RECREIO_CLIENTE_DE_TESTE === "1" ? ["teste"] : []),
];

/** Se a página `/jogar/<jogo>` existe para este jogo. */
export function temCliente(jogo: string): boolean {
  return COM_CLIENTE.includes(jogo);
}

/** Os ids dos jogos com cliente no portal, neste build. */
export function jogosComCliente(): readonly string[] {
  return COM_CLIENTE;
}
