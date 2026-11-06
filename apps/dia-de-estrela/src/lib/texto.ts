const lista = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** "A, B e C": listas em prosa, com o "e" antes do último item. */
export function listaPtBr(itens: readonly string[]): string {
  return lista.format(itens);
}
