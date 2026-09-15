import { localDay } from "../learning/engine";

/**
 * Desafio da família: uma meta semanal única, somada entre todos os perfis.
 *
 * Três decisões que separam isto de um ranking entre irmãos:
 *
 * - A meta é de **variedade**: estratégias distintas resolvidas sem pistas na
 *   semana. Contar respostas premiaria repetir a mesma família de atividade,
 *   que é exatamente o que o motor de evidência recusa como domínio.
 * - A barra é **uma só**. A contribuição de cada perfil aparece, mas sem
 *   ordenação e sem destaque para quem fez mais.
 * - A semana termina e recomeça **sem dívida**. Não existe meta perdida, e a
 *   landing promete ao comprador que não há comparação pública entre crianças.
 */

const dayMs = 86_400_000;

/** Segunda-feira da semana local de São Paulo, em `YYYY-MM-DD`. */
export function weekStart(now: Date) {
  const hoje = localDay(now);
  const meiaNoiteUtc = Date.parse(`${hoje}T00:00:00Z`);
  // getUTCDay: domingo = 0. A semana da família começa na segunda.
  const diaDaSemana = new Date(meiaNoiteUtc).getUTCDay();
  const recuo = (diaDaSemana + 6) % 7;
  return new Date(meiaNoiteUtc - recuo * dayMs).toISOString().slice(0, 10);
}

/**
 * Meta padrão sugerida: quatro estratégias por estudante na semana, dentro do
 * intervalo aceito pelo banco. É uma sugestão do app — quem aceita, ajusta e
 * encerra é o responsável.
 */
export function suggestedGoal(profiles: number) {
  return Math.min(Math.max(profiles * 4, 4), 40);
}

export function challengeShare(progress: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.min(progress / goal, 1);
}
