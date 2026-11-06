import type { Passo, Tarefa } from "./rotina";

export type RascunhoTarefa = Omit<Tarefa, "id">;

const SEG_A_SEX = 0b0111110;
const TODO_DIA = 0b1111111;
const DOM_A_QUI = 0b0011111;

const p = (text: string, detail?: string): Passo => (detail ? { text, detail } : { text });
const tarefa = (t: Partial<RascunhoTarefa> & Pick<RascunhoTarefa, "title" | "icon" | "time">) =>
  ({
    days: TODO_DIA,
    durationMin: null,
    stars: 2,
    steps: [],
    needs: [],
    thenText: null,
    detail: null,
    remind: true,
    requiresApproval: false,
    ...t,
  }) satisfies RascunhoTarefa;

/** Rotinas prontas oferecidas no primeiro uso e em Rotinas. Tudo editável depois. */
export const MODELOS: { id: string; name: string; tasks: RascunhoTarefa[] }[] = [
  {
    id: "manha-escola",
    name: "Manhã de escola",
    tasks: [
      tarefa({
        title: "Acordar e se vestir",
        icon: "sun",
        time: "06:40",
        days: SEG_A_SEX,
        needs: ["Uniforme"],
        steps: [
          p("Levantar da cama"),
          p("Tirar o pijama"),
          p("Vestir o uniforme"),
          p("Calçar meia e tênis"),
        ],
      }),
      tarefa({
        title: "Café da manhã",
        icon: "utensils",
        time: "07:00",
        days: SEG_A_SEX,
        stars: 1,
      }),
      tarefa({
        title: "Escovar os dentes",
        icon: "sparkles",
        time: "07:20",
        steps: [
          p("Colocar pasta na escova", "Do tamanho de uma ervilha"),
          p("Escovar os dentes de cima"),
          p("Escovar os dentes de baixo"),
          p("Enxaguar a boca e a escova"),
        ],
      }),
      tarefa({
        title: "Conferir a mochila",
        icon: "backpack",
        time: "07:30",
        days: SEG_A_SEX,
        steps: [p("Estojo"), p("Cadernos do dia"), p("Garrafinha de água"), p("Lanche")],
      }),
    ],
  },
  {
    id: "volta-escola",
    name: "Volta da escola",
    tasks: [
      tarefa({
        title: "Guardar a mochila",
        icon: "backpack",
        time: "12:30",
        days: SEG_A_SEX,
        steps: [
          p("Tirar a lancheira e levar à cozinha"),
          p("Pendurar a mochila no lugar dela"),
          p("Colocar o uniforme no cesto"),
        ],
      }),
      tarefa({
        title: "Lição de casa",
        icon: "book-open",
        time: "15:30",
        days: SEG_A_SEX,
        durationMin: 30,
        stars: 5,
        needs: ["Caderno", "Estojo"],
        thenText: "30 min de videogame",
        detail: "Abra a agenda e veja o que tem para hoje",
        requiresApproval: true,
        steps: [
          p("Abrir a agenda"),
          p("Separar o caderno certo", "Olhe na agenda qual matéria tem lição hoje"),
          p("Fazer a lição"),
          p("Guardar tudo na mochila"),
        ],
      }),
      tarefa({ title: "Lanche", icon: "apple", time: "16:00", stars: 1 }),
    ],
  },
  {
    id: "noite",
    name: "Noite",
    tasks: [
      tarefa({
        title: "Tomar banho",
        icon: "shower-head",
        time: "19:00",
        stars: 3,
        needs: ["Toalha", "Pijama", "Chinelo"],
        steps: [
          p("Tirar a roupa", "Coloque a roupa suja no cesto"),
          p("Ligar o chuveiro", "Teste a água com a mão antes de entrar"),
          p("Molhar o corpo todo"),
          p("Passar shampoo no cabelo", "Esfregue a cabeça toda com as pontas dos dedos"),
          p("Enxaguar o cabelo", "Até sair toda a espuma"),
          p("Passar sabonete no corpo", "Axilas, pescoço, barriga, pernas e pés"),
          p("Desligar o chuveiro e se secar"),
          p("Vestir o pijama"),
        ],
      }),
      tarefa({ title: "Jantar", icon: "utensils", time: "19:40" }),
      tarefa({
        title: "Separar a roupa de amanhã",
        icon: "shirt",
        time: "20:00",
        days: DOM_A_QUI,
        steps: [
          p("Separar o uniforme"),
          p("Separar meia e cueca/calcinha"),
          p("Deixar tudo na cadeira"),
        ],
      }),
      tarefa({
        title: "Escovar os dentes",
        icon: "sparkles",
        time: "20:15",
        steps: [
          p("Colocar pasta na escova"),
          p("Escovar os dentes de cima"),
          p("Escovar os dentes de baixo"),
          p("Enxaguar a boca e a escova"),
        ],
      }),
      tarefa({
        title: "Hora de dormir",
        icon: "bed",
        time: "20:30",
        stars: 3,
        steps: [p("Ir ao banheiro"), p("Apagar a luz"), p("Deitar na cama")],
      }),
    ],
  },
];

/** Ícones de tarefa que os pais podem escolher (nomes do Lucide). */
export const ICONES_TAREFA = [
  "sun",
  "utensils",
  "sparkles",
  "backpack",
  "book-open",
  "apple",
  "shower-head",
  "shirt",
  "bed",
  "pill",
  "dog",
  "trash-2",
  "gamepad-2",
  "music",
  "bike",
  "pencil",
  "brush",
  "glass-water",
  "bath",
  "house",
  "heart",
  "star",
  "calendar",
  "phone",
] as const;

/** Ícones dos itens da loja. */
export const ICONES_RECOMPENSA = [
  "banknote",
  "gamepad-2",
  "utensils",
  "trees",
  "ice-cream-cone",
  "tv",
  "gift",
  "bike",
  "music",
  "heart",
] as const;

/** Itens que toda família ganha ao começar: dinheiro, como no protótipo. */
export const RECOMPENSAS_INICIAIS = [
  { kind: "money" as const, name: "R$ 5,00", icon: "banknote", moneyCents: 500 },
  { kind: "money" as const, name: "R$ 10,00", icon: "banknote", moneyCents: 1000 },
];

/** Cores das crianças, com texto branco legível por cima (≥ 4,5:1). */
export const CORES_CRIANCA = ["#1F6FD1", "#6A49D6", "#C2410C", "#15803D", "#B4235A"] as const;
