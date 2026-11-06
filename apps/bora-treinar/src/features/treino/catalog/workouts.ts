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
/** Grátis: o Primeiro treino e o Aquecimento (decisão do titular em 06/11/2026). */
export const FREE_WORKOUT_IDS: readonly string[] = ["primeiro-treino", "aquecimento-5"];

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

/** Jeito de treinar do perfil (primeiro acesso): muda as trocas sem salto e as metas. */
export type Intensidade = "leve" | "normal" | "forte";

/**
 * "Leve" troca o que tem salto por uma versão sem impacto (crianças, apartamento, quem está
 * voltando a treinar). Só exercícios que existem no catálogo.
 */
export const SEM_IMPACTO: Readonly<Record<string, string>> = {
  "agachamento-salto": "agachamento-sumo",
  polichinelo: "escalador",
  "corrida-estacionaria": "escalador",
};

const FATOR: Record<Intensidade, number> = { leve: 0.7, normal: 1, forte: 1.15 };
const meta = (n: number, intensidade: Intensidade) =>
  Math.max(1, Math.round(n * FATOR[intensidade]));

/** Aquecimento automático: 2 minutos leves antes do treino, sem meta (não conta em trilha). */
export const AQUECIMENTO = ["corrida-estacionaria", "agachamento", "ponte", "polichinelo"] as const;
const AQUECIMENTO_TRABALHO = 25;
const AQUECIMENTO_PAUSA = 5;

/**
 * Volta à calma automática: alongamentos só de cronômetro (regra `timed`), sem câmera e sem
 * meta. Preenchida pelo catálogo quando os alongamentos existem.
 */
export const VOLTA_A_CALMA: readonly string[] = [
  "alongamento-quadriceps",
  "alongamento-posterior",
  "alongamento-peitoral",
  "postura-da-crianca",
];
const ALONGAMENTO = 30;

export interface OpcoesDoTreino {
  intensidade?: Intensidade;
  /** 2 minutos de aquecimento antes (padrão: não; o player liga pelo ajuste do aparelho) */
  aquecimento?: boolean;
  /** alongamentos no fim (padrão: não; o player liga pelo ajuste do aparelho) */
  voltaACalma?: boolean;
}

/** Item `i` de uma lista circular; blocos sempre têm ao menos um exercício. */
function pick<T>(items: readonly T[], i: number): T {
  const item = items[i % items.length];
  if (item === undefined) throw new Error("bloco sem exercícios");
  return item;
}

/**
 * Transforma o treino em passos lineares para o player, já com os níveis do perfil.
 *
 * Não há mais "Prepare-se" no começo: o portão "Pronto?" do player espera a câmera (ou o celular)
 * e a pessoa na posição antes do primeiro passo. Antes, os 8 s corriam enquanto o detector
 * ainda baixava ou o celular lia o QR, e o primeiro exercício se perdia.
 */
export function buildSteps(w: Workout, levels: LevelMap = {}, opcoes: OpcoesDoTreino = {}): Step[] {
  const intensidade = opcoes.intensidade ?? "normal";
  const troca = (id: string) => (intensidade === "leve" ? (SEM_IMPACTO[id] ?? id) : id);
  const resolver = (slot: Slot) => {
    const r = resolveSlot(slot, levels);
    return { ...r, exerciseId: troca(r.exerciseId) };
  };
  const steps: Step[] = [];
  const rest = (seconds: number, label: string, next?: string) => {
    // o primeiro passo é sempre exercício: quem prepara é o portão "Pronto?"
    if (!steps.length) return;
    const last = steps[steps.length - 1];
    if (last?.kind === "rest") {
      last.seconds = Math.max(last.seconds, seconds);
      last.next = next;
    } else steps.push({ kind: "rest", seconds, label, next });
  };
  if (opcoes.aquecimento && w.id !== "aquecimento-5" && w.focus !== "Mobilidade") {
    const ids = AQUECIMENTO.map(troca);
    ids.forEach((id, i) => {
      steps.push({
        kind: "exercise",
        exerciseId: id,
        window: AQUECIMENTO_TRABALHO,
        set: i + 1,
        sets: ids.length,
        label: "Aquecimento",
      });
      rest(AQUECIMENTO_PAUSA, "Aquecimento", ids[i + 1]);
    });
  }
  for (const b of w.blocks) {
    if (b.type === "sets") {
      const { exerciseId, bonus } = resolver(b.slot);
      rest(b.rest, "Descanso", exerciseId);
      for (let s = 1; s <= b.sets; s++) {
        steps.push({
          kind: "exercise",
          exerciseId,
          target: meta(b.target + bonus, intensidade),
          set: s,
          sets: b.sets,
          label: exerciseById(exerciseId).name,
        });
        if (s < b.sets) rest(b.rest, "Descanso", exerciseId);
      }
      rest(b.rest, "Descanso");
    } else if (b.type === "interval") {
      const ids = b.slots.map((s) => resolver(s).exerciseId);
      rest(30, "Descanso", pick(ids, 0));
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
      const items = b.slots.map((s) => ({ ...resolver(s.slot), reps: s.reps }));
      rest(30, "Descanso", pick(items, 0).exerciseId);
      for (let m = 1; m <= b.minutes; m++) {
        const it = pick(items, m - 1);
        steps.push({
          kind: "exercise",
          exerciseId: it.exerciseId,
          target: meta(it.reps + it.bonus, intensidade),
          window: 60,
          set: m,
          sets: b.minutes,
          label: b.label,
        });
      }
      rest(30, "Descanso");
    } else {
      const circuit = b.slots.map((s) => {
        const r = resolver(s.slot);
        return { exerciseId: r.exerciseId, reps: meta(s.reps + r.bonus, intensidade) };
      });
      rest(30, "Descanso", pick(circuit, 0).exerciseId);
      steps.push({ kind: "amrap", seconds: b.minutes * 60, circuit, label: b.label });
      rest(30, "Descanso");
    }
  }
  // não termina com descanso
  while (steps[steps.length - 1]?.kind === "rest") steps.pop();
  if (opcoes.voltaACalma && VOLTA_A_CALMA.length) {
    rest(10, "Volta à calma", VOLTA_A_CALMA[0]);
    VOLTA_A_CALMA.forEach((id, i) => {
      steps.push({
        kind: "exercise",
        exerciseId: id,
        window: ALONGAMENTO,
        set: i + 1,
        sets: VOLTA_A_CALMA.length,
        label: "Volta à calma",
      });
      if (i < VOLTA_A_CALMA.length - 1) rest(5, "Volta à calma", VOLTA_A_CALMA[i + 1]);
    });
  }
  return steps;
}

/**
 * Quantas séries com meta o treino planeja para cada exercício. O servidor usa para saber se a
 * pessoa fez todas as séries do nível (série que faltou é meta não batida) e para conferir a meta
 * de cada série, em vez de confiar na que o aparelho mandou.
 */
export function seriesPlanejadas(steps: readonly Step[]) {
  const contagem = new Map<string, number>();
  const metas = new Map<string, number[]>();
  for (const st of steps) {
    if (st.kind !== "exercise" || st.target === undefined) continue;
    contagem.set(st.exerciseId, (contagem.get(st.exerciseId) ?? 0) + 1);
    const lista = metas.get(st.exerciseId) ?? [];
    if (!lista.includes(st.target)) lista.push(st.target);
    metas.set(st.exerciseId, lista);
  }
  return { contagem, metas };
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
