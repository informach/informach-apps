import type { Cadence } from "../body/cadence";
import type { PoseId } from "../body/poses";
import type { CountRule, Metric } from "../engine/counter";

export type View = "front" | "side" | "three4";
export type Joint3D = "arms" | "chest" | "core" | "glutes" | "legs" | "shoulders";

export interface Exercise {
  id: string;
  name: string;
  /** frase curta mostrada durante a série */
  cue: string;
  pose: PoseId;
  view: View;
  cadence: Cadence;
  rule: CountRule;
  /** onde posicionar a câmera do aparelho */
  cameraHint: string;
  muscles: string[];
  /** partes do boneco destacadas */
  highlight: Joint3D[];
  mistakes: string[];
  /** o que a pessoa precisa além do chão; `apoio` e `parede` aparecem também na cena 3D */
  equipment: "chão" | "apoio" | "parede";
  /** exercício em que pés ou joelhos alternam a cada repetição */
  alternating?: boolean;
}

const line: Metric = { kind: "angle", at: ["shoulder", "hip", "ankle"] };
const lying: Metric = { kind: "incline", from: "hip", to: "shoulder" };

export const EXERCISES: Exercise[] = [
  {
    id: "agachamento",
    name: "Agachamento",
    cue: "Quadril para trás, joelhos na direção dos pés",
    pose: "squat",
    view: "three4",
    cadence: { down: 1.6, bottom: 0.2, up: 1.2, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["hip", "knee", "ankle"], combine: "avg" },
      rest: 150,
      peak: 95,
    },
    cameraHint: "Câmera de frente ou na diagonal, corpo inteiro visível",
    muscles: ["Quadríceps", "Glúteos", "Posterior de coxa"],
    highlight: ["legs", "glutes"],
    mistakes: ["Joelhos para dentro", "Calcanhar saindo do chão", "Costas arredondadas"],
    equipment: "chão",
  },
  {
    id: "afundo",
    name: "Afundo",
    cue: "Tronco reto, desça o joelho de trás até perto do chão",
    pose: "lunge",
    view: "side",
    cadence: { down: 1.5, bottom: 0.2, up: 1.2, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["hip", "knee", "ankle"], combine: "avg" },
      rest: 145,
      peak: 95,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Quadríceps", "Glúteos"],
    highlight: ["legs", "glutes"],
    mistakes: ["Joelho da frente passando muito da ponta do pé", "Tronco inclinado para a frente"],
    equipment: "chão",
  },
  {
    id: "flexao-joelhos",
    name: "Flexão com joelhos",
    cue: "Joelhos no chão, quadril alinhado, peito perto do chão",
    pose: "pushupKnees",
    view: "side",
    cadence: { down: 1.4, bottom: 0.1, up: 1, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "elbow", "wrist"] },
      rest: 145,
      peak: 90,
      checks: [
        {
          metric: { kind: "angle", at: ["shoulder", "hip", "knee"] },
          min: 145,
          cue: "Alinhe o quadril",
        },
      ],
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Peitoral", "Tríceps", "Ombros"],
    highlight: ["chest", "arms"],
    mistakes: ["Quadril alto", "Cotovelos muito abertos"],
    equipment: "chão",
  },
  {
    id: "flexao",
    name: "Flexão",
    cue: "Corpo reto como uma prancha, peito quase toca o chão",
    pose: "pushup",
    view: "side",
    cadence: { down: 1.5, bottom: 0.1, up: 1, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "elbow", "wrist"] },
      rest: 145,
      peak: 90,
      checks: [{ metric: line, min: 150, cue: "Mantenha o quadril alinhado" }],
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Peitoral", "Tríceps", "Ombros", "Core"],
    highlight: ["chest", "arms", "core"],
    mistakes: ["Quadril caindo", "Amplitude curta", "Cabeça projetada à frente"],
    equipment: "chão",
  },
  {
    id: "flexao-diamante",
    name: "Flexão diamante",
    cue: "Mãos juntas sob o peito, cotovelos rentes ao corpo",
    pose: "pushupDiamond",
    view: "side",
    cadence: { down: 1.6, bottom: 0.1, up: 1.1, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "elbow", "wrist"] },
      rest: 145,
      peak: 90,
      checks: [{ metric: line, min: 150, cue: "Mantenha o quadril alinhado" }],
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Tríceps", "Peitoral"],
    highlight: ["arms", "chest"],
    mistakes: ["Cotovelos abertos", "Quadril caindo"],
    equipment: "chão",
  },
  {
    id: "polichinelo",
    name: "Polichinelo",
    cue: "Abra braços e pernas juntos, aterrisse leve",
    pose: "jumpingJack",
    view: "front",
    cadence: { down: 0.35, bottom: 0.05, up: 0.35, top: 0.05 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["hip", "shoulder", "wrist"], combine: "avg" },
      rest: 45,
      peak: 140,
    },
    cameraHint: "Câmera de frente, corpo inteiro e braços visíveis",
    muscles: ["Cardio", "Ombros", "Panturrilhas"],
    highlight: ["shoulders", "legs"],
    mistakes: ["Braços sem subir acima da cabeça", "Aterrissar com o joelho travado"],
    equipment: "chão",
  },
  {
    id: "prancha",
    name: "Prancha",
    cue: "Antebraços no chão, abdômen firme, corpo em linha reta",
    pose: "plank",
    view: "side",
    cadence: { down: 1, bottom: 0, up: 1, top: 0 },
    rule: {
      kind: "hold",
      conditions: [
        { metric: lying, min: 55, cue: "Deite-se na posição de prancha" },
        { metric: line, min: 155, cue: "Alinhe o quadril com os ombros" },
      ],
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Core", "Ombros", "Glúteos"],
    highlight: ["core", "shoulders"],
    mistakes: ["Quadril alto", "Lombar afundando", "Prender a respiração"],
    equipment: "chão",
  },
  {
    id: "abdominal",
    name: "Abdominal completo",
    cue: "Suba o tronco até perto dos joelhos, desça devagar",
    pose: "situp",
    view: "side",
    cadence: { down: 1.2, bottom: 0.1, up: 1.3, top: 0.2 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"] },
      rest: 110,
      peak: 78,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Reto abdominal", "Flexores do quadril"],
    highlight: ["core"],
    mistakes: ["Puxar o pescoço", "Descer sem controle"],
    equipment: "chão",
  },
  {
    id: "ponte",
    name: "Ponte de glúteo",
    cue: "Empurre o chão com os calcanhares e suba o quadril",
    pose: "bridge",
    view: "side",
    cadence: { down: 1.2, bottom: 0.6, up: 1.2, top: 0.2 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"] },
      rest: 136,
      peak: 155,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Glúteos", "Posterior de coxa", "Lombar"],
    highlight: ["glutes", "core"],
    mistakes: ["Arquear a lombar no topo", "Empurrar com a ponta dos pés"],
    equipment: "chão",
  },
  {
    id: "flexao-inclinada",
    name: "Flexão inclinada",
    cue: "Mãos no sofá ou numa cadeira firme, corpo reto, peito vai até a borda",
    pose: "pushupIncline",
    view: "side",
    cadence: { down: 1.4, bottom: 0.1, up: 1, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "elbow", "wrist"] },
      rest: 145,
      peak: 90,
      checks: [{ metric: line, min: 150, cue: "Mantenha o quadril alinhado" }],
    },
    cameraHint: "Câmera de lado, mostrando você e o apoio",
    muscles: ["Peitoral", "Tríceps", "Ombros"],
    highlight: ["chest", "arms"],
    mistakes: ["Apoio que escorrega", "Quadril dobrado", "Cotovelos muito abertos"],
    equipment: "apoio",
  },
  {
    id: "flexao-pike",
    name: "Flexão pike",
    cue: "Quadril bem alto, corpo em V invertido, leve a cabeça entre as mãos",
    pose: "pike",
    view: "side",
    cadence: { down: 1.5, bottom: 0.1, up: 1.1, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "elbow", "wrist"] },
      rest: 145,
      peak: 95,
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Ombros", "Tríceps", "Trapézio"],
    highlight: ["shoulders", "arms"],
    mistakes: ["Quadril baixo, virando flexão comum", "Cotovelos abrindo para fora"],
    equipment: "chão",
  },
  {
    id: "agachamento-sumo",
    name: "Agachamento sumô",
    cue: "Pés bem afastados e virados para fora, joelhos acompanham os pés",
    pose: "sumoSquat",
    view: "front",
    cadence: { down: 1.6, bottom: 0.2, up: 1.2, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["hip", "knee", "ankle"], combine: "avg" },
      rest: 150,
      peak: 100,
    },
    cameraHint: "Câmera de frente, corpo inteiro visível",
    muscles: ["Adutores", "Glúteos", "Quadríceps"],
    highlight: ["legs", "glutes"],
    mistakes: ["Joelhos caindo para dentro", "Tronco tombando à frente"],
    equipment: "chão",
  },
  {
    id: "agachamento-salto",
    name: "Agachamento com salto",
    cue: "Agache, salte com força e aterrisse macio, já descendo",
    pose: "jumpSquat",
    view: "three4",
    cadence: { down: 0.7, bottom: 0.1, up: 0.45, top: 0.55 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["hip", "knee", "ankle"], combine: "avg" },
      rest: 145,
      peak: 100,
    },
    cameraHint: "Câmera de frente ou na diagonal, com espaço acima da cabeça",
    muscles: ["Quadríceps", "Glúteos", "Panturrilhas", "Cardio"],
    highlight: ["legs", "glutes"],
    mistakes: ["Aterrissar com o joelho travado", "Joelhos para dentro na aterrissagem"],
    equipment: "chão",
  },
  {
    id: "afundo-reverso",
    name: "Afundo reverso",
    cue: "Dê um passo para trás e desça o joelho de trás até perto do chão",
    pose: "reverseLunge",
    view: "side",
    cadence: { down: 1.5, bottom: 0.2, up: 1.3, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["hip", "knee", "ankle"], combine: "avg" },
      rest: 145,
      peak: 95,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Glúteos", "Quadríceps", "Posterior de coxa"],
    highlight: ["legs", "glutes"],
    mistakes: ["Tronco inclinado para a frente", "Passo curto demais"],
    equipment: "chão",
  },
  {
    id: "dobradica-quadril",
    name: "Dobradiça de quadril",
    cue: "Leve o quadril para trás com as costas retas até sentir a parte de trás da coxa",
    pose: "hinge",
    view: "side",
    cadence: { down: 1.6, bottom: 0.2, up: 1.3, top: 0.3 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"], combine: "avg" },
      rest: 145,
      peak: 105,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Posterior de coxa", "Glúteos", "Lombar"],
    highlight: ["glutes", "legs", "core"],
    mistakes: ["Arredondar as costas", "Dobrar demais os joelhos"],
    equipment: "chão",
  },
  {
    id: "cadeira-parede",
    name: "Cadeira na parede",
    cue: "Costas na parede, coxas quase paralelas ao chão, joelhos sobre os tornozelos",
    pose: "wallSit",
    view: "side",
    cadence: { down: 1, bottom: 0, up: 1, top: 0 },
    rule: {
      kind: "hold",
      conditions: [
        {
          metric: { kind: "angle", at: ["hip", "knee", "ankle"], combine: "avg" },
          max: 120,
          cue: "Desça até as coxas ficarem quase paralelas ao chão",
        },
        { metric: lying, max: 25, cue: "Mantenha as costas retas na parede" },
      ],
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Quadríceps", "Glúteos"],
    highlight: ["legs"],
    mistakes: ["Joelhos passando da ponta dos pés", "Apoiar as mãos nas coxas"],
    equipment: "parede",
  },
  {
    id: "prancha-lateral",
    name: "Prancha lateral",
    cue: "Apoio no antebraço, quadril alto, corpo reto da cabeça aos pés",
    pose: "sidePlank",
    view: "front",
    cadence: { down: 1, bottom: 0, up: 1, top: 0 },
    rule: {
      kind: "hold",
      conditions: [
        { metric: lying, min: 55, cue: "Deite de lado, apoiado no antebraço" },
        { metric: line, min: 155, cue: "Suba o quadril e alinhe o corpo" },
      ],
    },
    cameraHint: "Câmera de frente para você, na altura do chão",
    muscles: ["Oblíquos", "Core", "Ombros"],
    highlight: ["core", "shoulders"],
    mistakes: ["Quadril caindo", "Ombro longe do cotovelo de apoio"],
    equipment: "chão",
  },
  {
    id: "superman",
    name: "Super-homem",
    cue: "De bruços, levante braços, peito e pernas juntos e segure",
    pose: "superman",
    view: "side",
    cadence: { down: 1, bottom: 0, up: 1, top: 0 },
    rule: {
      kind: "hold",
      conditions: [
        { metric: lying, min: 60, cue: "Deite de barriga para baixo" },
        {
          metric: { kind: "angle", at: ["shoulder", "hip", "knee"] },
          max: 168,
          cue: "Tire braços e pernas do chão",
        },
      ],
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Lombar", "Glúteos", "Ombros"],
    highlight: ["core", "glutes"],
    mistakes: ["Jogar a cabeça para trás", "Prender a respiração"],
    equipment: "chão",
  },
  {
    id: "escalador",
    name: "Escalador",
    cue: "Em prancha alta, traga um joelho por vez em direção ao peito",
    pose: "mountainClimber",
    view: "side",
    cadence: { down: 0.35, bottom: 0.05, up: 0.35, top: 0.1 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"], combine: "min" },
      rest: 150,
      peak: 95,
    },
    cameraHint: "Câmera de lado, na altura do chão",
    muscles: ["Core", "Ombros", "Cardio"],
    highlight: ["core", "shoulders", "legs"],
    mistakes: ["Quadril subindo", "Mãos à frente dos ombros"],
    equipment: "chão",
    alternating: true,
  },
  {
    id: "abdominal-bicicleta",
    name: "Abdominal bicicleta",
    cue: "Ombros fora do chão, leve um joelho por vez em direção ao peito",
    pose: "bicycle",
    view: "side",
    cadence: { down: 0.8, bottom: 0.15, up: 0.8, top: 0.15 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"], combine: "min" },
      rest: 100,
      peak: 60,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Oblíquos", "Reto abdominal"],
    highlight: ["core"],
    mistakes: ["Puxar o pescoço com as mãos", "Pernas baixas demais forçando a lombar"],
    equipment: "chão",
    alternating: true,
  },
  {
    id: "corrida-estacionaria",
    name: "Corrida parada",
    cue: "Joelhos até a altura do quadril, braços acompanham",
    pose: "highKnees",
    view: "three4",
    cadence: { down: 0.3, bottom: 0.05, up: 0.3, top: 0.05 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"], combine: "min" },
      rest: 150,
      peak: 110,
    },
    cameraHint: "Câmera de frente ou na diagonal, corpo inteiro visível",
    muscles: ["Cardio", "Flexores do quadril", "Core"],
    highlight: ["legs", "core"],
    mistakes: ["Joelhos baixos", "Tronco jogado para trás"],
    equipment: "chão",
    alternating: true,
  },
  {
    id: "ponte-unilateral",
    name: "Ponte unilateral",
    cue: "Uma perna estendida, empurre com o calcanhar de apoio e suba o quadril",
    pose: "bridgeSingle",
    view: "side",
    cadence: { down: 1.2, bottom: 0.6, up: 1.2, top: 0.2 },
    rule: {
      kind: "reps",
      metric: { kind: "angle", at: ["shoulder", "hip", "knee"] },
      rest: 136,
      peak: 155,
    },
    cameraHint: "Câmera de lado, corpo inteiro visível",
    muscles: ["Glúteos", "Posterior de coxa", "Core"],
    highlight: ["glutes", "core"],
    mistakes: ["Quadril inclinando para o lado", "Perna estendida caindo"],
    equipment: "chão",
  },
];

export const exerciseById = (id: string) => {
  const e = EXERCISES.find((x) => x.id === id);
  if (!e) throw new Error(`exercício desconhecido: ${id}`);
  return e;
};

/** Trilhas de progressão: cada perfil avança de um nível para o próximo. */
export interface Chain {
  id: string;
  name: string;
  levels: string[];
  /** quanto somar à meta a cada avanço dentro do mesmo nível */
  step: number;
  /** quantas vezes somar antes de sugerir o próximo nível */
  maxBonus: number;
}

export const CHAINS: Chain[] = [
  {
    id: "empurrar",
    name: "Empurrar",
    levels: ["flexao-inclinada", "flexao-joelhos", "flexao", "flexao-diamante", "flexao-pike"],
    step: 2,
    maxBonus: 6,
  },
  {
    id: "pernas",
    name: "Pernas",
    levels: ["agachamento", "agachamento-sumo", "afundo", "afundo-reverso", "agachamento-salto"],
    step: 2,
    maxBonus: 8,
  },
  {
    id: "gluteos",
    name: "Glúteos",
    levels: ["ponte", "dobradica-quadril", "ponte-unilateral"],
    step: 2,
    maxBonus: 8,
  },
  {
    id: "core",
    name: "Core",
    levels: ["abdominal", "abdominal-bicicleta"],
    step: 2,
    maxBonus: 6,
  },
  {
    id: "isometria",
    name: "Isometria",
    levels: ["superman", "cadeira-parede", "prancha", "prancha-lateral"],
    step: 10,
    maxBonus: 60,
  },
  {
    id: "cardio",
    name: "Cardio",
    levels: ["polichinelo", "corrida-estacionaria", "escalador"],
    step: 5,
    maxBonus: 30,
  },
];

export const chainOf = (exerciseId: string) => CHAINS.find((c) => c.levels.includes(exerciseId));

/**
 * Trilhas do EdiBody, para importar backups: lá o nível era um índice na
 * trilha original, e aqui as trilhas ganharam degraus no começo.
 */
export const EDIBODY_CHAINS: Record<string, string[]> = {
  empurrar: ["flexao-joelhos", "flexao", "flexao-diamante"],
  pernas: ["agachamento", "afundo"],
  core: ["ponte", "abdominal"],
  isometria: ["prancha"],
  cardio: ["polichinelo"],
};
