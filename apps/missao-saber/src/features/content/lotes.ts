/**
 * Lotes de autoria conferidos, na ordem do inventário.
 *
 * Cada lote é uma faixa contígua de itens, do primeiro ao último id, e tem o
 * próprio registro em docs/propostas/missao-saber-2026-09-13/lotes-de-autoria.
 * O inventário confere que todo item pertence a exatamente um lote: um item
 * novo só entra no catálogo quando um lote o cobre.
 */
export type AuthoringLot = { number: number; firstItemId: string; lastItemId: string };

export const authoringLots: AuthoringLot[] = [
  { number: 1, firstItemId: "fracoes-1-1", lastItemId: "probabilidade-1-5" },
  { number: 2, firstItemId: "probabilidade-1-6", lastItemId: "porcentagem-5-4" },
  { number: 3, firstItemId: "porcentagem-5-5", lastItemId: "simetria-3-5" },
  { number: 4, firstItemId: "simetria-3-6", lastItemId: "probabilidade-4-6" },
  { number: 5, firstItemId: "probabilidade-4-7", lastItemId: "logica-5-7" },
  { number: 6, firstItemId: "logica-5-8", lastItemId: "bank:exam:obmep-n1-12" },
  // Onda 1a (8º/9º): OBMEP N2 e Canguru C.
  { number: 7, firstItemId: "proporcao-1-1", lastItemId: "equacoes-5-10" },
  { number: 8, firstItemId: "semelhanca-1-1", lastItemId: "pitagoras-5-10" },
  { number: 9, firstItemId: "restos-1-1", lastItemId: "contagem-casos-5-10" },
  { number: 10, firstItemId: "invariantes-1-1", lastItemId: "coordenadas-5-10" },
  { number: 11, firstItemId: "logica-n2-1-1", lastItemId: "bank:exam:canguru-c-12" },
  // Onda 1b (8º/9º): OLITEF N2.
  { number: 12, firstItemId: "porcentagem-n2-1-1", lastItemId: "juros-5-10" },
  { number: 13, firstItemId: "orcamento-n2-1-1", lastItemId: "inflacao-5-10" },
  { number: 14, firstItemId: "investimentos-1-1", lastItemId: "bank:exam:olitef-n2-12" },
  // Onda 2 (3º ao 5º): Canguru P e Mirim 2.
  { number: 15, firstItemId: "contagem-inicial-1-1", lastItemId: "padroes-iniciais-5-10" },
  { number: 16, firstItemId: "orientacao-espacial-1-1", lastItemId: "composicao-de-figuras-5-10" },
  { number: 17, firstItemId: "tempo-e-medidas-1-1", lastItemId: "balancas-5-10" },
  { number: 18, firstItemId: "caminhos-1-1", lastItemId: "tabelas-5-10" },
  { number: 19, firstItemId: "bank:diagnostic:canguru-p-1", lastItemId: "bank:exam:mirim-2-12" },
];
