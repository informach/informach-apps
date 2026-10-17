const ORDINALS = ["primeira", "segunda", "terceira", "quarta", "quinta"] as const;

/** "segunda", para a vaga 2; acima de cinco, cai para "6ª". */
export function ordinalSlot(position: number) {
  return ORDINALS[position - 1] ?? `${position}ª`;
}
