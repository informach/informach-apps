/**
 * O motor do dia: que tarefas acontecem hoje, qual é "a da vez", quando cada
 * lembrete toca e quando os pais são avisados. Funções puras, sem relógio nem
 * banco: tudo recebe o `Relogio` da família (hora local da casa) e os dados.
 *
 * Portado do protótipo Taskids (`src/domain/schedule.ts`), com o tempo local
 * vindo do fuso da família em vez do relógio do aparelho.
 */

export const MIN = 60_000;
/** Depois desse tempo sem marcar, a tarefa para de tocar (evita uma enxurrada de avisos). */
export const JANELA_LEMBRETE_MIN = 180;
/** Quantas vezes o "é agora" toca no máximo para a mesma tarefa. */
export const MAX_TOQUES = 6;

export type Passo = { text: string; detail?: string };

export type Tarefa = {
  id: string;
  title: string;
  icon: string;
  /** "HH:MM", hora local da casa. */
  time: string;
  /** Dias da semana em bitmask: bit 0 = domingo … bit 6 = sábado. */
  days: number;
  durationMin: number | null;
  stars: number;
  steps: Passo[];
  needs: string[];
  thenText: string | null;
  detail: string | null;
  remind: boolean;
  requiresApproval: boolean;
};

/**
 * O "agora" da casa: instante absoluto e a leitura dele no fuso da família.
 * `minutos` tem fração (segundos), para o motor de lembretes ser preciso.
 */
export type Relogio = {
  ms: number;
  /** AAAA-MM-DD local. */
  data: string;
  /** 0 = domingo. */
  diaDaSemana: number;
  minutos: number;
};

export type AjustesLembrete = {
  warnBefore: number;
  repeatEvery: number;
  alertAfter: number;
};

/** Estado dos lembretes de uma tarefa no dia (o que o aparelho e os pais registraram). */
export type RegistroLembrete = {
  warnedAt?: number | null;
  dueCount: number;
  lastDueAt?: number | null;
  snoozeUntil?: number | null;
  nudgeAt?: number | null;
};

export function minutosDe(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Instante (ms) do horário da tarefa no dia local do relógio. */
export function instanteDa(tarefa: Pick<Tarefa, "time">, agora: Relogio): number {
  return Math.round(agora.ms + (minutosDe(tarefa.time) - agora.minutos) * MIN);
}

export type Periodo = "manha" | "tarde" | "noite";
export const PERIODOS: Record<Periodo, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

export function periodoDe(time: string): Periodo {
  const m = minutosDe(time);
  if (m < 12 * 60) return "manha";
  if (m < 18 * 60) return "tarde";
  return "noite";
}

export function porHorario(a: Pick<Tarefa, "time">, b: Pick<Tarefa, "time">) {
  return minutosDe(a.time) - minutosDe(b.time);
}

export const aconteceNo = (dias: number, diaDaSemana: number) => (dias & (1 << diaDaSemana)) !== 0;

export function tarefasDoDia<T extends Pick<Tarefa, "days" | "time">>(
  tarefas: T[],
  diaDaSemana: number,
): T[] {
  return tarefas.filter((t) => aconteceNo(t.days, diaDaSemana)).sort(porHorario);
}

export type EstadoItem = "feita" | "agora" | "atrasada" | "por-vir";

export type VisaoDoDia<T> = {
  itens: { tarefa: T; estado: EstadoItem }[];
  /** A tarefa do cartão grande: a pendente mais recente que já começou, ou a próxima. */
  foco?: T;
  focoComecou: boolean;
  proxima?: T;
  feitas: number;
};

export function visaoDoDia<T extends Tarefa>(
  tarefas: T[],
  feitas: Set<string>,
  agora: Relogio,
): VisaoDoDia<T> {
  const pendentes = tarefas.filter((t) => !feitas.has(t.id));
  // O cartão mostra a tarefa "da vez" (a última que já começou); se ela já foi
  // feita, a próxima. As esquecidas de horas atrás ficam como atrasadas na lista.
  const vez = tarefas.filter((t) => instanteDa(t, agora) <= agora.ms).at(-1);
  const porVir = pendentes.filter((t) => instanteDa(t, agora) > agora.ms);
  const foco = vez && !feitas.has(vez.id) ? vez : (porVir[0] ?? pendentes.at(-1));
  const focoComecou = !!foco && instanteDa(foco, agora) <= agora.ms;
  const itens = tarefas.map((tarefa) => {
    if (feitas.has(tarefa.id)) return { tarefa, estado: "feita" as const };
    if (tarefa === foco && focoComecou) return { tarefa, estado: "agora" as const };
    if (instanteDa(tarefa, agora) <= agora.ms) return { tarefa, estado: "atrasada" as const };
    return { tarefa, estado: "por-vir" as const };
  });
  const proxima = foco ? pendentes[pendentes.indexOf(foco) + 1] : undefined;
  return { itens, foco, focoComecou, proxima, feitas: tarefas.length - pendentes.length };
}

/**
 * A criança só marca o que já chegou, ou a próxima da fila. Fecha a brecha do
 * protótipo, em que dava para marcar a noite inteira às três da tarde.
 */
export function criancaPodeMarcar(
  tarefa: Pick<Tarefa, "id" | "time">,
  tarefasHoje: Tarefa[],
  feitas: Set<string>,
  agora: Relogio,
): boolean {
  if (!tarefasHoje.some((t) => t.id === tarefa.id) || feitas.has(tarefa.id)) return false;
  if (instanteDa(tarefa, agora) <= agora.ms) return true;
  const proxima = tarefasHoje.find((t) => !feitas.has(t.id) && instanteDa(t, agora) > agora.ms);
  return proxima?.id === tarefa.id;
}

export type EventoLembrete = {
  tipo: "aviso" | "agora";
  tarefa: Tarefa;
  /** Quantas vezes o "é agora" já tocou antes deste. */
  repeticao: number;
};

/**
 * Qual lembrete mostrar agora, se algum.
 * - "aviso": transição, `warnBefore` minutos antes, uma vez só.
 * - "agora": no horário, e de novo a cada `repeatEvery` minutos enquanto não for marcada.
 * A tarefa mais cedo tem prioridade.
 */
export function proximoLembrete(
  tarefas: Tarefa[],
  feitas: Set<string>,
  registros: Record<string, RegistroLembrete | undefined>,
  ajustes: Pick<AjustesLembrete, "warnBefore" | "repeatEvery">,
  agora: Relogio,
): EventoLembrete | null {
  const ativas = tarefas.filter((t) => t.remind && !feitas.has(t.id));
  for (const [i, tarefa] of ativas.entries()) {
    const quando = instanteDa(tarefa, agora);
    const r = registros[tarefa.id] ?? { dueCount: 0 };
    if (r.snoozeUntil && agora.ms < r.snoozeUntil) continue;
    if (r.nudgeAt && (r.lastDueAt ?? 0) < r.nudgeAt)
      return { tipo: "agora", tarefa, repeticao: r.dueCount };
    if (r.snoozeUntil && r.dueCount > 0 && (r.lastDueAt ?? 0) < r.snoozeUntil)
      return { tipo: "agora", tarefa, repeticao: r.dueCount };
    if (agora.ms < quando) {
      if (ajustes.warnBefore > 0 && agora.ms >= quando - ajustes.warnBefore * MIN && !r.warnedAt)
        return { tipo: "aviso", tarefa, repeticao: 0 };
      continue;
    }
    // Uma tarefa esquecida sai de cena quando chega a vez da próxima (os pais já foram avisados).
    const depois = ativas[i + 1];
    if (depois && agora.ms >= instanteDa(depois, agora) - ajustes.warnBefore * MIN) continue;
    if (agora.ms - quando > JANELA_LEMBRETE_MIN * MIN || r.dueCount >= MAX_TOQUES) continue;
    if (r.dueCount === 0) return { tipo: "agora", tarefa, repeticao: 0 };
    if (
      ajustes.repeatEvery > 0 &&
      r.lastDueAt != null &&
      agora.ms - r.lastDueAt >= ajustes.repeatEvery * MIN
    )
      return { tipo: "agora", tarefa, repeticao: r.dueCount };
  }
  return null;
}

/**
 * Hora de avisar os pais: a tarefa passou do horário pelo tempo de
 * `alertAfter` lembretes sem ser marcada. Depende só do relógio, não do
 * aparelho: um tablet desligado também gera o alerta.
 */
export function precisaAlertarPais(
  tarefa: Pick<Tarefa, "time" | "remind">,
  feita: boolean,
  ajustes: Pick<AjustesLembrete, "repeatEvery" | "alertAfter">,
  agora: Relogio,
): boolean {
  if (!tarefa.remind || feita) return false;
  const quando = instanteDa(tarefa, agora);
  // O n-ésimo "é agora" toca em horário + (n − 1) × repetir a cada.
  const limite = quando + (ajustes.alertAfter - 1) * ajustes.repeatEvery * MIN;
  return agora.ms >= limite && agora.ms - quando <= JANELA_LEMBRETE_MIN * MIN;
}

/** O que a criança ouve em cada lembrete. */
export function falaDoLembrete(evento: EventoLembrete, nome: string, warnBefore: number) {
  const t = evento.tarefa.title.toLowerCase();
  if (evento.tipo === "aviso")
    return `${nome}, daqui a ${warnBefore} minutos é hora de: ${t}. Pode ir terminando o que está fazendo.`;
  if (evento.repeticao > 0) return `${nome}, ainda falta: ${t}. Vamos lá?`;
  return `${nome}, é hora de: ${t}.`;
}

export function formatarHora(ms: number, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}

export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export function rotuloDosDias(dias: number): string {
  if (dias === 0b1111111) return "todos os dias";
  if (dias === 0b0111110) return "seg a sex";
  if (dias === 0b1000001) return "fim de semana";
  if (dias === 0b0011111) return "dom a qui";
  return DIAS_CURTOS.filter((_, i) => aconteceNo(dias, i)).join(", ");
}
