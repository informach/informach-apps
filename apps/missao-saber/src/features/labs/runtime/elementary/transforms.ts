import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import type { Point } from "./geometry";
import { activity, assessNumber, format, requireMode } from "./math";

export const transformSchema = z
  .object({
    x: z.number().int().min(-4).max(4),
    y: z.number().int().min(-4).max(4),
    tx: z.number().int().min(-4).max(4),
    ty: z.number().int().min(-4).max(4),
    turns: z.number().int().min(0).max(3),
    axis: z.enum(["vertical", "horizontal"]),
    secondReflection: z.boolean().default(false),
    figure: z
      .enum(["quadrado", "retangulo", "triangulo-equilatero", "paralelogramo"])
      .default("quadrado"),
    axisAngle: z.number().int().min(0).max(165).multipleOf(15).default(0),
    scale: z.number().min(0.25).max(4).multipleOf(0.25),
    sideA: z.number().int().min(1).max(5),
    sideB: z.number().int().min(1).max(5),
    near: z.number().int().min(1).max(5),
    far: z.number().int().min(2).max(10),
  })
  .strict()
  .refine(
    (state) => state.far > state.near,
    "A segunda paralela precisa ficar mais distante do vértice.",
  );
export type TransformState = z.infer<typeof transformSchema>;
type Kind =
  | "reflect"
  | "translate"
  | "rotate"
  | "compose"
  | "fold"
  | "scale"
  | "area"
  | "tales"
  | "criteria"
  | "symmetry";
type Definition = { title: string; kind: Kind; prompt: string; label: string };
export const transformCases: Record<string, Definition> = {
  "simetria-rotacional": {
    title: "Girar e voltar a coincidir",
    kind: "symmetry",
    prompt:
      "Escolha uma figura e gire ao redor de seu centro. A imagem girada aparece sobre a original. As figuras coincidem por inteiro depois desse giro? Teste um quarto e meia volta, sem confundir giro com reflexão.",
    label: "A figura coincide depois do giro?",
  },
  "simetria-de-figuras": {
    title: "O eixo realmente divide em espelhos?",
    kind: "symmetry",
    prompt:
      "Escolha uma figura e incline a linha do espelho. A imagem refletida aparece sobre a original. Esse eixo é um eixo de simetria? Para ser, as figuras devem coincidir por inteiro, não apenas em um ponto.",
    label: "O eixo escolhido é de simetria?",
  },
  escalas: {
    title: "Da planta à construção",
    kind: "scale",
    prompt:
      "Amplie ou reduza o retângulo pelo fator indicado. Todos os comprimentos usam a mesma unidade. Qual será a medida do lado horizontal da imagem?",
    label: "Lado horizontal da imagem",
  },
  refletir: {
    title: "Do outro lado do espelho",
    kind: "reflect",
    prompt:
      "Mova o ponto e escolha o eixo do espelho. Qual é a coordenada que muda de sinal na reflexão? Se o eixo é vertical, responda x; se é horizontal, responda y.",
    label: "Coordenada refletida que muda de sinal",
  },
  "mover-e-preservar": {
    title: "Deslocar sem deformar",
    kind: "translate",
    prompt:
      "Desloque a figura horizontal e verticalmente. Observe que os lados não mudam. Qual é a nova coordenada x do ponto marcado?",
    label: "Nova coordenada x",
  },
  "construir-reflexao": {
    title: "Construir o ponto espelhado",
    kind: "reflect",
    prompt:
      "Construa o reflexo escolhendo um ponto e um eixo. Compare as distâncias dos dois pontos ao eixo. Qual é a coordenada perpendicular ao eixo depois da reflexão?",
    label: "Coordenada perpendicular refletida",
  },
  "reflexao-rotacao-translacao": {
    title: "Um quarto de volta",
    kind: "rotate",
    prompt:
      "Gire o ponto ao redor da origem, em quartos de volta no sentido anti-horário. Qual é sua coordenada x depois do giro? Compare um giro com o efeito de um espelho.",
    label: "Coordenada x depois do giro",
  },
  "compor-transformacoes": {
    title: "A ordem das transformações",
    kind: "compose",
    prompt:
      "Primeiro reflita o ponto no eixo escolhido; você pode marcar uma segunda reflexão no mesmo eixo. Depois gire e por último desloque. Qual é a coordenada x final? Trocar a ordem pode mudar o resultado.",
    label: "Coordenada x final",
  },
  "forma-e-razao": {
    title: "Mudar o tamanho mantendo a forma",
    kind: "scale",
    prompt:
      "Mude o fator que multiplica os dois lados do retângulo. Um fator menor que 1 reduz a figura. Qual é a nova medida horizontal? A razão entre lados correspondentes deve ser a mesma.",
    label: "Lado horizontal da imagem",
  },
  "correspondencia-de-lados": {
    title: "Qual lado corresponde?",
    kind: "scale",
    prompt:
      "As marcas A e B identificam os lados correspondentes dos dois retângulos. Qual é a medida do lado A no segundo retângulo? Compare sempre A com A.",
    label: "Medida do lado A da imagem",
  },
  tales: {
    title: "Duas retas paralelas",
    kind: "tales",
    prompt:
      "As duas retas horizontais são paralelas e cortam os mesmos raios. Conhecemos a distância entre os raios na paralela mais próxima. Qual é essa distância na paralela mais afastada?",
    label: "Distância entre os raios na paralela distante",
  },
  "escala-e-area": {
    title: "Lados em dobro, área em quanto?",
    kind: "area",
    prompt:
      "Mude os dois lados do retângulo pelo mesmo fator. Qual é a área do segundo retângulo? Compare o fator de comprimento com o fator de área.",
    label: "Área da imagem em unidades quadradas",
  },
  criterios: {
    title: "O que garante a semelhança?",
    kind: "criteria",
    prompt:
      "Compare os retângulos, as razões dos lados correspondentes e seus ângulos retos. Explique por que são semelhantes. Diga também por que só ter um par de lados proporcionais não bastaria para figuras quaisquer.",
    label: "Sua justificativa",
  },
  "refletir-no-plano": {
    title: "Reflexão no plano",
    kind: "reflect",
    prompt:
      "Escolha um ponto em qualquer quadrante e reflita no eixo indicado. Qual coordenada muda de sinal e qual fica igual? Responda o valor da coordenada que muda.",
    label: "Valor da coordenada que muda",
  },
  espelhos: {
    title: "Perto e longe do espelho",
    kind: "reflect",
    prompt:
      "Leve a marca para perto e para longe do espelho. O reflexo fica à mesma distância, do outro lado. A quantos passos do espelho fica a marca refletida?",
    label: "Passos entre o espelho e o reflexo",
  },
  "dobrar-cortar-abrir": {
    title: "Um corte, duas marcas",
    kind: "fold",
    prompt:
      "Imagine o papel dobrado no eixo do espelho. Faça uma marca fora da dobra e abra o papel. Quantas marcas diferentes aparecem? Se a marca estiver sobre a dobra, ela não se duplica.",
    label: "Marcas diferentes depois de abrir",
  },
  "girar-ou-refletir": {
    title: "Girar a peça",
    kind: "rotate",
    prompt:
      "Gire a peça em quartos de volta no sentido da seta. Compare a marca antes e depois. Quantos quartos de volta formam o giro que você fez? Dois quartos formam meia volta.",
    label: "Quantidade de quartos de volta",
  },
  semelhanca: {
    title: "Semelhança e área",
    kind: "area",
    prompt:
      "Construa retângulos semelhantes. Multiplique cada comprimento pelo mesmo fator. Qual é a área da imagem? Justifique por que a razão das áreas é o quadrado do fator.",
    label: "Área do retângulo resultante",
  },
};
export function transformDefinition(launch: ToolLaunch) {
  return requireMode(launch, "L06", transformCases);
}
export function parseTransform(launch: ToolLaunch, raw: unknown): TransformState {
  transformDefinition(launch);
  return transformSchema.parse(raw);
}
export function reflectPoint(point: Point, axis: TransformState["axis"]): Point {
  return axis === "vertical" ? { x: -point.x, y: point.y } : { x: point.x, y: -point.y };
}
export function rotatePoint(point: Point, turns: number): Point {
  const count = ((turns % 4) + 4) % 4;
  if (count === 0) return { ...point };
  if (count === 1) return { x: -point.y, y: point.x };
  if (count === 2) return { x: -point.x, y: -point.y };
  return { x: point.y, y: -point.x };
}
export function symmetryFigure(state: TransformState): Point[] {
  if (state.figure === "quadrado")
    return [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
    ];
  if (state.figure === "retangulo")
    return [
      { x: -3, y: -1 },
      { x: 3, y: -1 },
      { x: 3, y: 1 },
      { x: -3, y: 1 },
    ];
  if (state.figure === "paralelogramo")
    return [
      { x: -3, y: -1 },
      { x: 1, y: -1 },
      { x: 3, y: 1 },
      { x: -1, y: 1 },
    ];
  return [
    { x: 0, y: 3 },
    { x: (-3 * Math.sqrt(3)) / 2, y: -1.5 },
    { x: (3 * Math.sqrt(3)) / 2, y: -1.5 },
  ];
}
export function reflectAtAngle(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(2 * angle) * point.x + Math.sin(2 * angle) * point.y,
    y: Math.sin(2 * angle) * point.x - Math.cos(2 * angle) * point.y,
  };
}
export function hasSymmetryAxis(state: TransformState): boolean {
  const figure = symmetryFigure(state);
  return figure.every((point) => {
    const reflected = reflectAtAngle(point, state.axisAngle);
    return figure.some(
      (candidate) => Math.hypot(reflected.x - candidate.x, reflected.y - candidate.y) < 1e-8,
    );
  });
}
export function hasRotationalSymmetry(state: TransformState): boolean {
  const figure = symmetryFigure(state);
  return figure.every((point) => {
    const rotated = rotatePoint(point, state.turns);
    return figure.some(
      (candidate) => Math.hypot(rotated.x - candidate.x, rotated.y - candidate.y) < 1e-8,
    );
  });
}
function matchesFigure(launch: ToolLaunch, state: TransformState) {
  return launch.mode === "simetria-rotacional"
    ? hasRotationalSymmetry(state)
    : hasSymmetryAxis(state);
}
export function transformedPoint(launch: ToolLaunch, state: TransformState): Point {
  const kind = transformDefinition(launch).kind;
  const point = { x: state.x, y: state.y };
  if (kind === "reflect" || kind === "fold") return reflectPoint(point, state.axis);
  if (kind === "rotate") return rotatePoint(point, state.turns);
  if (kind === "compose") {
    const reflected = reflectPoint(point, state.axis);
    const turned = rotatePoint(
      state.secondReflection ? reflectPoint(reflected, state.axis) : reflected,
      state.turns,
    );
    return { x: turned.x + state.tx, y: turned.y + state.ty };
  }
  return { x: point.x + state.tx, y: point.y + state.ty };
}
export function transformValue(launch: ToolLaunch, state: TransformState): number {
  if (launch.mode === "espelhos") return Math.abs(state.axis === "vertical" ? state.x : state.y);
  if (launch.mode === "girar-ou-refletir") return state.turns;
  switch (transformDefinition(launch).kind) {
    case "symmetry":
      return Number(matchesFigure(launch, state));
    case "reflect":
      return state.axis === "vertical" ? -state.x : -state.y;
    case "translate":
    case "rotate":
    case "compose":
      return transformedPoint(launch, state).x;
    case "fold":
      return (state.axis === "vertical" ? state.x : state.y) === 0 ? 1 : 2;
    case "scale":
      return state.sideA * state.scale;
    case "area":
      return state.sideA * state.sideB * state.scale ** 2;
    case "tales":
      return (state.sideA * state.far) / state.near;
    case "criteria":
      return 0;
  }
}
export function transformSummary(launch: ToolLaunch, state: TransformState): string {
  const kind = transformDefinition(launch).kind;
  if (launch.grade <= 4 && (kind === "reflect" || kind === "fold"))
    return `Espelho ${state.axis}; a marca e sua imagem ficam à mesma distância da dobra: ${Math.abs(state.axis === "vertical" ? state.x : state.y)} passos. ${kind === "fold" ? `${transformValue(launch, state)} marcas diferentes depois de abrir.` : ""}`;
  if (launch.grade <= 4 && kind === "rotate")
    return `Giro de ${state.turns} quartos de volta no sentido anti-horário. Compare a marca A com sua imagem A′; girar preserva a distância ao centro.`;
  if (kind === "symmetry")
    return `${state.figure}; ${launch.mode === "simetria-rotacional" ? `giro de ${state.turns * 90} graus` : `eixo a ${state.axisAngle} graus em relação à horizontal`}. A imagem ${matchesFigure(launch, state) ? "coincide" : "não coincide"} com a figura original.`;
  if (kind === "scale" || kind === "area" || kind === "criteria")
    return `Retângulo ${state.sideA} × ${state.sideB}; fator ${state.scale}; imagem ${state.sideA * state.scale} × ${state.sideB * state.scale}; razão das áreas ${state.scale ** 2}.`;
  if (kind === "tales")
    return `Distâncias do vértice ${state.near} e ${state.far}; largura próxima ${state.sideA}; largura distante ${format(transformValue(launch, state))}. As retas são paralelas.`;
  const result = transformedPoint(launch, state);
  return `Ponto (${state.x}, ${state.y}) → (${result.x}, ${result.y}); ${kind === "rotate" ? `${state.turns} quartos de volta anti-horários` : kind === "translate" ? `deslocamento (${state.tx}, ${state.ty})` : kind === "compose" ? `${state.secondReflection ? "duas reflexões" : "reflexão"} ${state.axis}, ${state.turns} quartos de volta, deslocamento (${state.tx}, ${state.ty})` : `espelho ${state.axis}`}.`;
}
export const transformsTool: ToolModule = {
  family: "L06",
  modes: Object.keys(transformCases),
  activity(launch) {
    const definition = transformDefinition(launch);
    return activity(
      definition.title,
      definition.prompt,
      {
        x: 2 + launch.variant,
        y: 1 + launch.variant,
        tx: 2,
        ty: -1,
        turns: 1 + launch.variant,
        axis: "vertical",
        scale: 2 + launch.variant,
        sideA: 3,
        sideB: 2,
        near: 2,
        far: 4 + launch.variant,
        secondReflection: false,
        figure: launch.variant ? "retangulo" : "quadrado",
        axisAngle: 45,
      },
      definition.label,
      {
        ...(["criteria", "symmetry"].includes(definition.kind) || launch.mode === "refletir"
          ? {}
          : {
              answerKeys: [
                ...(["scale", "area", "tales"].includes(definition.kind)
                  ? ["decimal" as const, "fraction" as const]
                  : []),
                ...(["reflect", "translate", "rotate", "compose"].includes(definition.kind) &&
                launch.mode !== "espelhos" &&
                launch.mode !== "girar-ou-refletir"
                  ? ["negative" as const]
                  : []),
              ],
            }),
        ...(definition.kind === "symmetry"
          ? { choices: ["Sim", "Não"] }
          : launch.mode === "refletir"
            ? { choices: ["x", "y"] }
            : {}),
        answerHint:
          launch.mode === "refletir"
            ? "Escolha o nome da coordenada perpendicular ao eixo: x ou y."
            : definition.kind === "criteria"
              ? "Nomeie lados correspondentes, razões e ângulos."
              : "Use decimal ou fração; arredonde para 4 casas quando necessário.",
        rubric: [
          "Lados e pontos correspondentes estão identificados.",
          "A transformação preserva as propriedades previstas.",
          "Uma razão de comprimentos não é confundida com uma razão de áreas.",
        ],
      },
    );
  },
  parse: parseTransform,
  assess(launch, raw, answer) {
    const state = parseTransform(launch, raw);
    const summary = transformSummary(launch, state);
    if (launch.mode === "refletir")
      return {
        correct: answer.trim().toLowerCase() === (state.axis === "vertical" ? "x" : "y"),
        message:
          "No espelho vertical, x passa a −x; no horizontal, y passa a −y. A outra coordenada fica igual. Se a coordenada vale zero, seu oposto também vale zero.",
        summary,
      };
    if (transformDefinition(launch).kind === "symmetry")
      return {
        correct:
          answer.trim().toLocaleLowerCase("pt-BR") ===
          (matchesFigure(launch, state) ? "sim" : "não"),
        message: matchesFigure(launch, state)
          ? "A imagem coincide com toda a figura; há simetria nessa transformação."
          : "Pelo menos um vértice transformado fica fora dos vértices correspondentes da figura; não há simetria nessa transformação.",
        summary,
      };
    if (transformDefinition(launch).kind === "criteria")
      return {
        correct: null,
        message:
          "Revise se sua justificativa apresenta os pares correspondentes e uma condição suficiente. Observar exemplos não substitui uma prova para todas as figuras.",
        summary,
      };
    return assessNumber(
      answer,
      transformValue(launch, state),
      "Use o eixo, a ordem das ações e os lados correspondentes indicados.",
      summary,
    );
  },
  summarize: (launch, raw) => transformSummary(launch, parseTransform(launch, raw)),
};
