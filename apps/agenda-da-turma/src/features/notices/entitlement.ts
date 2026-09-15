/**
 * Tipo compartilhado entre servidor e cliente.
 *
 * Mora fora de `trial.ts` de propósito: aquele módulo declara `server-only`, e
 * a folha Adicionar e o rodapé são componentes de cliente. `import type` é
 * apagado na compilação, então importar de lá funcionaria hoje — mas basta um
 * import de valor por descuido para `server-only` entrar no bundle do
 * navegador e quebrar a página inteira. Um módulo sem dependências evita o
 * acidente em vez de contar com a disciplina de quem edita.
 */
export type AddEntitlement = {
  isPro: boolean;
  trialLeft: number;
  /**
   * Atividades que nasceram de um recado lido. Só é calculado quando a franquia
   * acabou e a conta não é Pro — nos outros casos vem zero, porque ninguém o lê.
   */
  organizedFromNotices: number;
};
