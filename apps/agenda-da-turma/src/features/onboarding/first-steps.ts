/**
 * Os primeiros passos da casa, calculados do que já existe.
 *
 * Não há uma coluna dizendo "onboarding concluído": cada passo é uma pergunta
 * que o próprio banco responde. Assim ele nunca mente — apagar a única criança
 * traz o primeiro passo de volta, e ninguém precisa reconciliar um estado
 * paralelo.
 *
 * Puro de propósito: a trilha é a mesma coisa que os três widgets soltos
 * mediam, e é ela que vira teste.
 */
export type FirstStep = {
  id: "crianca" | "turma" | "horario" | "atividade";
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

export type FirstStepsInput = {
  profileCount: number;
  profilesWithoutTurma: number;
  /**
   * Turmas ativas das crianças da casa que ainda não têm nenhuma matéria com
   * dias de aula — de qualquer criador. Criar matéria é direito de qualquer
   * membro da turma, então o passo é acionável mesmo para quem entrou por
   * código em vez de criar a turma.
   */
  turmasNeedingSchedule: Array<{ turmaId: string }>;
  activityCount: number;
};

export function computeFirstSteps(input: FirstStepsInput): FirstStep[] {
  const hasProfile = input.profileCount > 0;
  // Toda criança vinculada, não "alguma": numa casa com três filhos, duas sem
  // turma continuam sendo trabalho por fazer.
  const hasTurma = hasProfile && input.profilesWithoutTurma === 0;
  const firstTurmaNeedingSchedule = input.turmasNeedingSchedule[0]?.turmaId;
  return [
    {
      id: "crianca",
      title: "Cadastre quem você acompanha",
      description: "Só o nome basta. Escola e turma podem vir depois.",
      href: "/familia",
      cta: "Criar perfil",
      done: hasProfile,
    },
    {
      id: "turma",
      title: "Vincule a uma turma",
      description:
        "A turma traz as matérias e permite receber as atividades que outras famílias cadastram.",
      href: "/familia/turmas",
      cta: "Ver turmas",
      done: hasTurma,
    },
    {
      id: "horario",
      title: "Cadastre as matérias e o horário",
      description:
        "Com os dias de aula, a Agenda sugere o prazo pela próxima aula e monta a mochila de amanhã.",
      href: firstTurmaNeedingSchedule
        ? `/turmas/${firstTurmaNeedingSchedule}/materias`
        : "/familia/turmas",
      cta: "Cadastrar matérias",
      done: hasTurma && input.turmasNeedingSchedule.length === 0,
    },
    {
      id: "atividade",
      title: "Traga o primeiro recado",
      description: "Foto, print, PDF ou ditado. Você confere tudo antes de salvar.",
      href: "/recados/novo?modo=foto",
      cta: "Adicionar atividade",
      done: input.activityCount > 0,
    },
  ];
}

export function firstStepsProgress(steps: FirstStep[]) {
  const done = steps.filter((step) => step.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
