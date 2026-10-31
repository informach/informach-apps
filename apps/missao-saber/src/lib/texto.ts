const lista = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** "A, B e C": listas em prosa, com o "e" antes do último item. */
export function listaPtBr(itens: readonly string[]): string {
  return lista.format(itens);
}

/** "1:05": segundos em minutos e segundos, arredondando para cima. */
export function formatarTempo(segundos: number) {
  const s = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
