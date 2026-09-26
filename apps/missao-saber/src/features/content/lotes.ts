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
];
