/**
 * Sorteio por contador. Não existe gerador com estado: cada sorteio é uma
 * função da semente do mundo, de um domínio, de uma chave e do tick. Um
 * sistema novo nunca desloca os sorteios de outro, e o mesmo instante sempre
 * sorteia igual.
 */

function misturar(h: number, k: number): number {
  let bloco = Math.imul(k, 0xcc9e2d51);
  bloco = (bloco << 15) | (bloco >>> 17);
  bloco = Math.imul(bloco, 0x1b873593);
  let saida = h ^ bloco;
  saida = (saida << 13) | (saida >>> 19);
  return (Math.imul(saida, 5) + 0xe6546b64) | 0;
}

function finalizar(h: number): number {
  let saida = h;
  saida ^= saida >>> 16;
  saida = Math.imul(saida, 0x85ebca6b);
  saida ^= saida >>> 13;
  saida = Math.imul(saida, 0xc2b2ae35);
  saida ^= saida >>> 16;
  return saida >>> 0;
}

/** Resumo de 32 bits de um texto. Estável entre plataformas. */
export function resumoDoTexto(texto: string, semente = 0): number {
  let h = semente | 0;
  for (let i = 0; i < texto.length; i++) h = misturar(h, texto.charCodeAt(i));
  return finalizar(h ^ texto.length);
}

/** Inteiro sem sinal de 32 bits. */
export function sorteio(
  semente: number,
  dominio: string,
  chave: string,
  tick: number,
  n = 0,
): number {
  let h = resumoDoTexto(dominio, semente) | 0;
  h = misturar(h, resumoDoTexto(chave));
  h = misturar(h, tick | 0);
  h = misturar(h, Math.floor(tick / 0x100000000) | 0);
  h = misturar(h, n | 0);
  return finalizar(h);
}

/** Inteiro em `[0, limite)`. */
export function sorteioAte(
  limite: number,
  semente: number,
  dominio: string,
  chave: string,
  tick: number,
  n = 0,
): number {
  if (limite <= 0) throw new Error("O limite do sorteio precisa ser positivo");
  return Math.floor((sorteio(semente, dominio, chave, tick, n) * limite) / 0x100000000);
}
