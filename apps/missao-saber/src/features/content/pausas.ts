/**
 * Pausas do explorador.
 *
 * O tempo sugerido pelo responsável era só um texto em `/hoje`: nunca chegava,
 * nunca era comemorado, nunca propunha nada. Aqui ele passa a render uma
 * oferta de pausa curta, fora da tela.
 *
 * Três regras de autoria, herdadas da decisão escrita em `Routine` — a rotina
 * é sugestão, sem bloqueio e sem punição:
 *
 * 1. Cada pausa cabe em dois minutos e não precisa de nada comprado.
 * 2. Nenhuma vale recompensa, moeda ou selo. Pausa premiada deixa de ser pausa
 *    e passa a ser tarefa.
 * 3. Metade delas dá o que pensar sem virar exercício: observar uma forma,
 *    estimar uma distância. A outra metade é só corpo e descanso.
 */
export const explorerBreaks = [
  "Beba um copo de água e leve outro para alguém da casa.",
  "Olhe pela janela e procure três formas que se repetem.",
  "Levante e estime quantos passos faltam até a porta. Depois confira andando.",
  "Feche os olhos e respire fundo cinco vezes, contando devagar.",
  "Procure uma embalagem na cozinha e leia quanto ela pesa.",
  "Estique os braços, gire os ombros e olhe para a coisa mais distante que você alcança com os olhos.",
] as const;

/**
 * Escolha estável a partir de um identificador — o mesmo `seed` devolve sempre
 * a mesma pausa. Sorteio real mudaria a cada renderização e quebraria a
 * hidratação entre servidor e navegador.
 */
export function explorerBreakFor(seed: string) {
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) total += seed.charCodeAt(index);
  return explorerBreaks[total % explorerBreaks.length] ?? explorerBreaks[0];
}
