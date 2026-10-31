import { CHAINS, exerciseById } from "./catalog";

/** Exercício fixo (`flexao`) ou o nível atual do perfil numa trilha (`trilha:empurrar`). */
export type Slot = string;

export type Block =
  | { type: "sets"; slot: Slot; sets: number; target: number; rest: number }
  | { type: "interval"; label: string; slots: Slot[]; work: number; rest: number; rounds: number }
  | { type: "emom"; label: string; slots: { slot: Slot; reps: number }[]; minutes: number }
  | { type: "amrap"; label: string; slots: { slot: Slot; reps: number }[]; minutes: number };

export interface Workout {
  id: string;
  name: string;
  subtitle: string;
  level: "Iniciante" | "Intermediário" | "Avançado";
  focus: string;
  blocks: Block[];
}

export const WORKOUTS: Workout[] = [
  {
    id: "primeiro-treino",
    name: "Primeiro treino",
    subtitle: "Corpo todo, ritmo tranquilo",
    level: "Iniciante",
    focus: "Força",
    blocks: [
      { type: "sets", slot: "trilha:pernas", sets: 3, target: 10, rest: 45 },
      { type: "sets", slot: "trilha:empurrar", sets: 3, target: 8, rest: 60 },
      { type: "sets", slot: "trilha:gluteos", sets: 3, target: 12, rest: 45 },
      { type: "sets", slot: "prancha", sets: 2, target: 20, rest: 40 },
    ],
  },
  {
    id: "corpo-todo",
    name: "Corpo todo",
    subtitle: "Força com as suas progressões",
    level: "Intermediário",
    focus: "Força",
    blocks: [
      { type: "sets", slot: "agachamento", sets: 3, target: 15, rest: 45 },
      { type: "sets", slot: "trilha:empurrar", sets: 3, target: 10, rest: 60 },
      { type: "sets", slot: "afundo", sets: 3, target: 10, rest: 45 },
      { type: "sets", slot: "abdominal", sets: 3, target: 12, rest: 45 },
      { type: "sets", slot: "prancha", sets: 3, target: 40, rest: 40 },
    ],
  },
  {
    id: "tabata-pernas",
    name: "Tabata pernas",
    subtitle: "8 rodadas de 20 s forte + 10 s pausa",
    level: "Intermediário",
    focus: "Cardio",
    blocks: [
      {
        type: "interval",
        label: "Tabata",
        slots: ["agachamento", "polichinelo"],
        work: 20,
        rest: 10,
        rounds: 8,
      },
    ],
  },
  {
    id: "emom-6",
    name: "EMOM 6 minutos",
    subtitle: "Cada minuto: faça as repetições e descanse o resto",
    level: "Intermediário",
    focus: "Resistência",
    blocks: [
      {
        type: "emom",
        label: "EMOM",
        slots: [
          { slot: "trilha:empurrar", reps: 6 },
          { slot: "agachamento", reps: 12 },
        ],
        minutes: 6,
      },
    ],
  },
  {
    id: "amrap-8",
    name: "AMRAP 8 minutos",
    subtitle: "Máximo de voltas no circuito",
    level: "Avançado",
    focus: "Condicionamento",
    blocks: [
      {
        type: "amrap",
        label: "AMRAP",
        slots: [
          { slot: "polichinelo", reps: 15 },
          { slot: "agachamento", reps: 10 },
          { slot: "trilha:empurrar", reps: 5 },
        ],
        minutes: 8,
      },
    ],
  },
  {
    id: "core-rapido",
    name: "Core rápido",
    subtitle: "10 minutos para abdômen e glúteos",
    level: "Iniciante",
    focus: "Core",
    blocks: [
      { type: "sets", slot: "ponte", sets: 2, target: 15, rest: 30 },
      { type: "sets", slot: "abdominal", sets: 2, target: 12, rest: 30 },
      { type: "sets", slot: "prancha", sets: 2, target: 30, rest: 30 },
    ],
  },
  {
    id: "aquecimento-5",
    name: "Aquecimento 5 minutos",
    subtitle: "Para soltar o corpo antes de qualquer treino",
    level: "Iniciante",
    focus: "Mobilidade",
    blocks: [
      {
        type: "interval",
        label: "Aquecimento",
        slots: ["polichinelo", "agachamento", "corrida-estacionaria", "dobradica-quadril"],
        work: 30,
        rest: 10,
        rounds: 6,
      },
    ],
  },
  {
    id: "treino-familia",
    name: "Treino da família",
    subtitle: "Fácil e divertido para fazer junto, do pequeno ao adulto",
    level: "Iniciante",
    focus: "Diversão",
    blocks: [
      {
        type: "interval",
        label: "Brincadeira",
        slots: ["polichinelo", "agachamento", "corrida-estacionaria"],
        work: 30,
        rest: 15,
        rounds: 6,
      },
      { type: "sets", slot: "ponte", sets: 2, target: 10, rest: 30 },
      { type: "sets", slot: "superman", sets: 2, target: 15, rest: 30 },
    ],
  },
  {
    id: "pernas-gluteos",
    name: "Pernas e glúteos",
    subtitle: "Força para a parte de baixo, com as suas trilhas",
    level: "Intermediário",
    focus: "Força",
    blocks: [
      { type: "sets", slot: "trilha:pernas", sets: 3, target: 12, rest: 45 },
      { type: "sets", slot: "afundo-reverso", sets: 3, target: 10, rest: 45 },
      { type: "sets", slot: "trilha:gluteos", sets: 3, target: 12, rest: 40 },
      { type: "sets", slot: "agachamento-sumo", sets: 2, target: 15, rest: 40 },
      { type: "sets", slot: "cadeira-parede", sets: 2, target: 30, rest: 40 },
    ],
  },
  {
    id: "core-10",
    name: "Core 10",
    subtitle: "Dez minutos de abdômen, lombar e oblíquos",
    level: "Intermediário",
    focus: "Core",
    blocks: [
      { type: "sets", slot: "trilha:core", sets: 3, target: 12, rest: 30 },
      { type: "sets", slot: "abdominal-bicicleta", sets: 2, target: 16, rest: 30 },
      { type: "sets", slot: "prancha-lateral", sets: 2, target: 20, rest: 30 },
      { type: "sets", slot: "superman", sets: 2, target: 20, rest: 30 },
    ],
  },
  {
    id: "isometria-total",
    name: "Isometria total",
    subtitle: "Posições sustentadas para o corpo inteiro, sem impacto",
    level: "Intermediário",
    focus: "Resistência",
    blocks: [
      { type: "sets", slot: "trilha:isometria", sets: 3, target: 30, rest: 30 },
      { type: "sets", slot: "cadeira-parede", sets: 2, target: 30, rest: 30 },
      { type: "sets", slot: "superman", sets: 2, target: 20, rest: 30 },
    ],
  },
  {
    id: "cardio-sem-pulo",
    name: "Cardio sem pulo",
    subtitle: "Para apartamento: coração acelerado sem incomodar o vizinho",
    level: "Iniciante",
    focus: "Cardio",
    blocks: [
      {
        type: "interval",
        label: "Circuito",
        slots: ["agachamento", "escalador", "afundo-reverso", "dobradica-quadril"],
        work: 40,
        rest: 20,
        rounds: 8,
      },
    ],
  },
  {
    id: "hiit-12",
    name: "HIIT 12",
    subtitle: "12 rodadas de 40 s forte + 20 s pausa",
    level: "Avançado",
    focus: "Cardio",
    blocks: [
      {
        type: "interval",
        label: "HIIT",
        slots: ["agachamento-salto", "escalador", "polichinelo", "corrida-estacionaria"],
        work: 40,
        rest: 20,
        rounds: 12,
      },
    ],
  },
  {
    id: "emom-10",
    name: "EMOM 10 minutos",
    subtitle: "Força e fôlego alternados a cada minuto",
    level: "Avançado",
    focus: "Condicionamento",
    blocks: [
      {
        type: "emom",
        label: "EMOM",
        slots: [
          { slot: "trilha:empurrar", reps: 8 },
          { slot: "agachamento-salto", reps: 10 },
          { slot: "escalador", reps: 20 },
        ],
        minutes: 10,
      },
    ],
  },
  {
    id: "forca-avancada",
    name: "Força avançada",
    subtitle: "Volume alto com os níveis mais difíceis das suas trilhas",
    level: "Avançado",
    focus: "Força",
    blocks: [
      { type: "sets", slot: "trilha:empurrar", sets: 4, target: 10, rest: 60 },
      { type: "sets", slot: "trilha:pernas", sets: 4, target: 12, rest: 60 },
      { type: "sets", slot: "flexao-pike", sets: 3, target: 8, rest: 60 },
      { type: "sets", slot: "ponte-unilateral", sets: 3, target: 10, rest: 45 },
      { type: "sets", slot: "prancha-lateral", sets: 3, target: 30, rest: 40 },
    ],
  },
];

/** Treinos liberados no plano gratuito. */
export const FREE_WORKOUT_IDS: readonly string[] = ["primeiro-treino"];

export function workoutById(id: string) {
  const workout = WORKOUTS.find((w) => w.id === id);
  if (!workout) throw new Error(`treino desconhecido: ${id}`);
  return workout;
}

export type Step =
  | {
      kind: "exercise";
      exerciseId: string;
      /** repetições, ou segundos em isometrias */
      target?: number;
      /** caixa de tempo em segundos (Tabata, EMOM) */
      window?: number;
      set: number;
      sets: number;
      label: string;
    }
  | { kind: "rest"; seconds: number; label: string; next?: string }
  | {
      kind: "amrap";
      seconds: number;
      circuit: { exerciseId: string; reps: number }[];
      label: string;
    };

/** Nível atual do perfil em cada trilha: exercício e bônus de meta. */
export type LevelMap = Record<string, { level: number; bonus: number }>;

export function resolveSlot(slot: Slot, levels: LevelMap): { exerciseId: string; bonus: number } {
  if (!slot.startsWith("trilha:")) {
    const chain = CHAINS.find((c) => c.levels.includes(slot));
    const p = chain && levels[chain.id];
    // só aplica o bônus quando o exercício fixo é o nível atual do perfil
    return { exerciseId: slot, bonus: p && chain.levels[p.level] === slot ? p.bonus : 0 };
  }
  const chain = CHAINS.find((c) => c.id === slot.slice(7));
  if (!chain) throw new Error(`trilha desconhecida: ${slot}`);
  const p = levels[chain.id] ?? { level: 0, bonus: 0 };
  return {
    exerciseId: pick(chain.levels, Math.min(p.level, chain.levels.length - 1)),
    bonus: p.bonus,
  };
}

const PREPARE = 8;

/** Item `i` de uma lista circular; blocos sempre têm ao menos um exercício. */
function pick<T>(items: readonly T[], i: number): T {
  const item = items[i % items.length];
  if (item === undefined) throw new Error("bloco sem exercícios");
  return item;
}

/** Transforma o treino em passos lineares para o player, já com os níveis do perfil. */
export function buildSteps(w: Workout, levels: LevelMap = {}): Step[] {
  const steps: Step[] = [];
  const rest = (seconds: number, label: string, next?: string) => {
    const last = steps[steps.length - 1];
    if (last?.kind === "rest") {
      last.seconds = Math.max(last.seconds, seconds);
      last.next = next;
    } else steps.push({ kind: "rest", seconds, label, next });
  };
  for (const b of w.blocks) {
    if (b.type === "sets") {
      const { exerciseId, bonus } = resolveSlot(b.slot, levels);
      rest(steps.length ? b.rest : PREPARE, steps.length ? "Descanso" : "Prepare-se", exerciseId);
      for (let s = 1; s <= b.sets; s++) {
        steps.push({
          kind: "exercise",
          exerciseId,
          target: b.target + bonus,
          set: s,
          sets: b.sets,
          label: exerciseById(exerciseId).name,
        });
        if (s < b.sets) rest(b.rest, "Descanso", exerciseId);
      }
      rest(b.rest, "Descanso");
    } else if (b.type === "interval") {
      const ids = b.slots.map((s) => resolveSlot(s, levels).exerciseId);
      rest(steps.length ? 30 : PREPARE, steps.length ? "Descanso" : "Prepare-se", pick(ids, 0));
      for (let r = 1; r <= b.rounds; r++) {
        const id = pick(ids, r - 1);
        const isHold = exerciseById(id).rule.kind === "hold";
        steps.push({
          kind: "exercise",
          exerciseId: id,
          target: isHold ? b.work : undefined,
          window: b.work,
          set: r,
          sets: b.rounds,
          label: b.label,
        });
        if (r < b.rounds) rest(b.rest, "Pausa", pick(ids, r));
      }
      rest(30, "Descanso");
    } else if (b.type === "emom") {
      const items = b.slots.map((s) => ({ ...resolveSlot(s.slot, levels), reps: s.reps }));
      rest(
        steps.length ? 30 : PREPARE,
        steps.length ? "Descanso" : "Prepare-se",
        pick(items, 0).exerciseId,
      );
      for (let m = 1; m <= b.minutes; m++) {
        const it = pick(items, m - 1);
        steps.push({
          kind: "exercise",
          exerciseId: it.exerciseId,
          target: it.reps + it.bonus,
          window: 60,
          set: m,
          sets: b.minutes,
          label: b.label,
        });
      }
      rest(30, "Descanso");
    } else {
      const circuit = b.slots.map((s) => {
        const r = resolveSlot(s.slot, levels);
        return { exerciseId: r.exerciseId, reps: s.reps + r.bonus };
      });
      rest(
        steps.length ? 30 : PREPARE,
        steps.length ? "Descanso" : "Prepare-se",
        pick(circuit, 0).exerciseId,
      );
      steps.push({ kind: "amrap", seconds: b.minutes * 60, circuit, label: b.label });
      rest(30, "Descanso");
    }
  }
  // não termina com descanso
  while (steps[steps.length - 1]?.kind === "rest") steps.pop();
  return steps;
}

export function estimateMinutes(w: Workout) {
  const steps = buildSteps(w);
  const s = steps.reduce((t, st) => {
    if (st.kind === "rest") return t + st.seconds;
    if (st.kind === "amrap") return t + st.seconds;
    if (st.window) return t + st.window;
    const ex = exerciseById(st.exerciseId);
    if (ex.rule.kind === "hold") return t + (st.target ?? 30);
    const c = ex.cadence;
    return t + (st.target ?? 10) * (c.down + c.bottom + c.up + c.top);
  }, 0);
  return Math.max(1, Math.round(s / 60));
}
