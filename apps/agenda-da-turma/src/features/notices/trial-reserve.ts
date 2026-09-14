/**
 * Aritmética da franquia de teste, sem servidor nem banco, para poder ser
 * testada de verdade.
 *
 * Ficou de fora de `trial.ts` de propósito: aquele módulo é `server-only` e
 * fala com o banco e com o billing, então a conta que decide se alguém pode
 * ditar nunca era exercitada por teste. Foi exatamente aí que o ditado quebrou.
 */
export const FREE_NOTICE_TRIAL = 5;

/**
 * Ditar é iterativo — regravar porque a frase saiu errada é o normal. Financiar
 * uma transcrição por importação faria o primeiro erro consumir a importação.
 */
const TRIAL_VOICE_CALLS_PER_IMPORT = 3;

export const TRIAL_GRANT_AMOUNTS = {
  base: FREE_NOTICE_TRIAL,
  voice: FREE_NOTICE_TRIAL * TRIAL_VOICE_CALLS_PER_IMPORT,
} as const;

/**
 * Um crédito por importação restante fica reservado para a leitura do recado.
 * O ditado só entra no que sobra, para que o saldo nunca morra antes do teto de
 * importações — senão a tela anuncia importações que falham.
 */
export function voiceFitsInTrial(available: number, importsLeft: number): boolean {
  return available - 1 >= importsLeft;
}
