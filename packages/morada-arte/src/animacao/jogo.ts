import { z } from "zod";

/**
 * Os clipes que o jogo usa. Cada pedido tem o nome que o jogo conhece (o
 * `animacao` de uma interação da simulação, ou uma das posturas básicas da
 * cena) e, em ordem de preferência, os ids da biblioteca de animação que o
 * atendem. Um candidato marcado como `substituto` não é o gesto pedido: é o
 * mais próximo que a biblioteca tem, e sai no relatório como falta.
 *
 * Os nomes das interações são os de `packages/morada-sim/src/conteudo/interacoes.ts`
 * (`animacao` e `animacaoDoAlvo`). Aqui não há nada da arte: só nomes.
 */

export const FAIXAS = ["colo", "pequeno", "crianca", "adolescente", "adulto", "idoso"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const PedidoDeClipeSchema = z.strictObject({
  /** Nome que o jogo usa (`resident.eat.stand`, `postura.andando`). */
  nome: z.string().min(1),
  /** Quem toca este clipe: as fases dos moradores que podem fazer (ou receber) a interação. */
  fases: z.array(z.enum(FAIXAS)).min(1),
  candidatos: z
    .array(z.strictObject({ id: z.string().min(1), substituto: z.boolean().default(false) }))
    .min(1),
});

export type PedidoDeClipe = z.infer<typeof PedidoDeClipeSchema>;

const DE_PE: Faixa[] = ["pequeno", "crianca", "adolescente", "adulto", "idoso"];
const CRIANCA_OU_MAIS: Faixa[] = ["crianca", "adolescente", "adulto", "idoso"];
const QUEM_CUIDA: Faixa[] = ["adolescente", "adulto", "idoso"];
const ADULTOS: Faixa[] = ["adulto", "idoso"];
const TODOS: Faixa[] = [...FAIXAS];

const certo = (id: string) => ({ id, substituto: false });
const quase = (id: string) => ({ id, substituto: true });

/** As posturas básicas da cena: o que toca sem interação nenhuma. */
export const POSTURAS = [
  "parado",
  "andando",
  "sentado",
  "deitado",
  "dormindo",
  "carregando",
  "no_colo",
] as const;
export type Postura = (typeof POSTURAS)[number];
export const nomeDaPostura = (postura: Postura): string => `postura.${postura}`;

export const CLIPES_DO_JOGO: readonly PedidoDeClipe[] = [
  // ---- posturas básicas (o idoso tem parado e andar próprios; o bebê de colo senta e engatinha)
  {
    nome: "postura.parado",
    fases: TODOS,
    candidatos: [
      certo("resident.idle.old"),
      certo("resident.idle.neutral"),
      certo("resident.baby.sit"),
    ],
  },
  {
    nome: "postura.andando",
    fases: TODOS,
    candidatos: [
      certo("resident.walk.old"),
      certo("resident.walk.normal"),
      certo("resident.baby.crawl"),
    ],
  },
  {
    nome: "postura.sentado",
    fases: TODOS,
    candidatos: [certo("resident.sit.chair.idle"), certo("resident.baby.sit")],
  },
  { nome: "postura.deitado", fases: TODOS, candidatos: [certo("resident.lie.idle")] },
  { nome: "postura.dormindo", fases: TODOS, candidatos: [certo("resident.sleep.idle")] },
  { nome: "postura.carregando", fases: QUEM_CUIDA, candidatos: [certo("resident.care.hold_idle")] },
  { nome: "postura.no_colo", fases: ["colo"], candidatos: [certo("resident.lie.idle")] },

  // ---- interações da simulação (`animacao`)
  {
    nome: "resident.idle.stand",
    fases: DE_PE,
    candidatos: [certo("resident.idle.old"), certo("resident.idle.neutral")],
  },
  {
    nome: "resident.sleep.bed",
    fases: CRIANCA_OU_MAIS,
    candidatos: [certo("resident.sleep.idle")],
  },
  {
    nome: "resident.eat.stand",
    fases: CRIANCA_OU_MAIS,
    candidatos: [quase("resident.drink.stand")],
  },
  {
    nome: "resident.cook.stove",
    fases: QUEM_CUIDA,
    candidatos: [certo("resident.stove.pan"), certo("resident.kitchen.stir")],
  },
  {
    nome: "resident.toilet.use",
    fases: CRIANCA_OU_MAIS,
    candidatos: [certo("resident.toilet.use")],
  },
  {
    nome: "resident.shower.use",
    fases: CRIANCA_OU_MAIS,
    candidatos: [certo("resident.shower.wash")],
  },
  { nome: "resident.sink.wash", fases: CRIANCA_OU_MAIS, candidatos: [certo("resident.wash")] },
  {
    nome: "resident.sit.sofa.watch",
    fases: CRIANCA_OU_MAIS,
    candidatos: [certo("resident.tv.watch"), quase("resident.sit.sofa.relaxed")],
  },
  {
    nome: "resident.play.floor",
    fases: ["pequeno", "crianca"],
    candidatos: [certo("resident.play.floor_toys")],
  },
  { nome: "resident.talk.stand", fases: CRIANCA_OU_MAIS, candidatos: [certo("resident.talk.a")] },
  { nome: "resident.hug.give", fases: CRIANCA_OU_MAIS, candidatos: [certo("resident.hug")] },
  {
    nome: "resident.flirt.give",
    fases: ADULTOS,
    candidatos: [quase("resident.romance.blow_kiss")],
  },
  {
    nome: "resident.kiss.give",
    fases: ADULTOS,
    candidatos: [certo("resident.romance.kiss_taller")],
  },
  { nome: "resident.propose.dating", fases: ADULTOS, candidatos: [quase("resident.talk.b")] },
  {
    nome: "resident.propose.marriage",
    fases: ADULTOS,
    candidatos: [certo("resident.romance.propose")],
  },
  {
    nome: "resident.wave.big",
    fases: CRIANCA_OU_MAIS,
    candidatos: [certo("resident.wave.big"), quase("resident.wave")],
  },
  { nome: "resident.care.feed", fases: QUEM_CUIDA, candidatos: [quase("resident.care.hold_idle")] },
  {
    nome: "resident.care.change",
    fases: QUEM_CUIDA,
    candidatos: [quase("resident.laundry.fold"), quase("resident.clean.wipe")],
  },
  { nome: "resident.care.wash", fases: QUEM_CUIDA, candidatos: [quase("resident.pet.bathe")] },
  { nome: "resident.care.rock", fases: QUEM_CUIDA, candidatos: [certo("resident.care.rock")] },
  {
    nome: "resident.care.play",
    fases: CRIANCA_OU_MAIS,
    candidatos: [
      quase("resident.play.floor_toys"),
      quase("resident.sit.floor.crossed"),
      quase("resident.clap"),
    ],
  },
  {
    nome: "resident.care.pick_up",
    fases: QUEM_CUIDA,
    candidatos: [quase("resident.pet.pickup"), quase("resident.pickup.floor")],
  },
  {
    nome: "resident.care.put_down",
    fases: QUEM_CUIDA,
    candidatos: [quase("resident.pickup.floor")],
  },
  { nome: "resident.sleep.floor", fases: DE_PE, candidatos: [quase("resident.sleep.idle")] },
  { nome: "baby.sleep", fases: ["colo"], candidatos: [certo("resident.sleep.idle")] },

  // ---- o que o alvo de uma interação toca (`animacaoDoAlvo`)
  {
    nome: "resident.talk.listen",
    fases: CRIANCA_OU_MAIS,
    candidatos: [certo("resident.talk.listen")],
  },
  { nome: "resident.hug.receive", fases: CRIANCA_OU_MAIS, candidatos: [certo("resident.hug")] },
  { nome: "resident.flirt.receive", fases: ADULTOS, candidatos: [quase("resident.laugh")] },
  {
    nome: "resident.kiss.receive",
    fases: ADULTOS,
    candidatos: [certo("resident.romance.kiss_shorter")],
  },
  { nome: "resident.eat.sit", fases: ["pequeno"], candidatos: [certo("resident.eat.sit")] },
  { nome: "baby.feed", fases: ["colo"], candidatos: [quase("resident.lie.idle")] },
  { nome: "baby.lie", fases: ["colo"], candidatos: [certo("resident.lie.idle")] },
  { nome: "baby.held", fases: ["colo"], candidatos: [certo("resident.lie.idle")] },
  {
    nome: "baby.play",
    fases: ["colo"],
    candidatos: [certo("resident.baby.rattle"), certo("resident.play.floor_toys")],
  },
];

/** Fase dos moradores que usam cada faixa de corpo da página. */
export function faixaDoJogo(idade: string): Faixa | null {
  const faixa = FAIXAS.find((f) => f === idade);
  return faixa ?? null;
}

export type Escolha = {
  nome: string;
  /** Id do clipe na biblioteca, ou `null` quando ela não tem nenhum dos candidatos. */
  clipe: string | null;
  substituto: boolean;
};

/** Para uma biblioteca (o que ela tem e quem a usa), o clipe de cada pedido. */
export function escolherClipes(
  pedidos: readonly PedidoDeClipe[],
  disponiveis: ReadonlySet<string>,
  faixa: Faixa,
): Escolha[] {
  return pedidos
    .filter((pedido) => pedido.fases.includes(faixa))
    .map((pedido) => {
      const achado = pedido.candidatos.find((c) => disponiveis.has(c.id));
      return {
        nome: pedido.nome,
        clipe: achado?.id ?? null,
        substituto: achado?.substituto ?? false,
      };
    });
}

/** Sentado, ajoelhado, agachado ou deitado: a página troca os pesos das saias nestas poses. */
export const POSE_DOBRADA = /(^|[._])(sit|lie|crouch|kneel|squat|propose)([._]|$)/;
