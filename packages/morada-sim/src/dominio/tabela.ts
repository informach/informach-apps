/**
 * Tabela normalizada: os dados por id e a ordem de criação. Toda iteração da
 * simulação segue `ordem`, nunca a ordem das chaves do objeto.
 */
export type Tabela<K extends string, V> = {
  porId: Record<K, V>;
  ordem: K[];
};

export function tabelaVazia<K extends string, V>(): Tabela<K, V> {
  return { porId: {} as Record<K, V>, ordem: [] };
}

export function tem<K extends string, V>(tabela: Tabela<K, V>, id: K): boolean {
  return Object.hasOwn(tabela.porId, id);
}

export function obter<K extends string, V>(tabela: Tabela<K, V>, id: K): V | undefined {
  return tem(tabela, id) ? tabela.porId[id] : undefined;
}

export function exigir<K extends string, V>(tabela: Tabela<K, V>, id: K): V {
  const valor = obter(tabela, id);
  if (valor === undefined) throw new Error(`Não existe: ${id}`);
  return valor;
}

export function inserir<K extends string, V>(tabela: Tabela<K, V>, id: K, valor: V): V {
  if (tem(tabela, id)) throw new Error(`Já existe: ${id}`);
  tabela.porId[id] = valor;
  tabela.ordem.push(id);
  return valor;
}

export function remover<K extends string, V>(tabela: Tabela<K, V>, id: K): void {
  if (!tem(tabela, id)) return;
  delete tabela.porId[id];
  tabela.ordem.splice(tabela.ordem.indexOf(id), 1);
}

/** Os valores, na ordem de criação. Devolve uma lista nova: pode-se alterar a tabela ao percorrer. */
export function listar<K extends string, V>(tabela: Tabela<K, V>): V[] {
  const saida: V[] = [];
  for (const id of tabela.ordem) {
    const valor = tabela.porId[id];
    if (valor !== undefined) saida.push(valor);
  }
  return saida;
}
