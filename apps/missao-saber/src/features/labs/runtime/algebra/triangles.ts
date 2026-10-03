import { z } from "zod";
import type { ToolLaunch, ToolModule } from "../types";
import { formatNumber, triangleFromSides } from "./math";
import { activity, assertMode, checked, normalized, numericChecked } from "./shared";

export const triangleModes = [
  "catetos-hipotenusa-e-quadrados",
  "cateto-desconhecido",
  "alturas-diagonais",
  "altura-para-area",
  "classificar-distancias",
  "angulos-e-paralelas",
  "circulos-e-tangentes",
  "construcoes",
  "razoes-triangulo",
  "angulos-notaveis",
  "lei-senos-cossenos",
  "area-seno",
  "alturas-distancias-navegacao",
];
export const triangleStateSchema = z
  .object({
    a: z.number().int().min(1).max(20),
    b: z.number().int().min(1).max(20),
    c: z.number().int().min(1).max(30),
    angle: z.number().int().min(15).max(150),
    secondAngle: z.number().int().min(15).max(150),
    radius: z.number().int().min(1).max(10),
    distance: z.number().int().min(2).max(25),
    ratio: z.enum(["seno", "cosseno", "tangente"]),
    law: z.enum(["cossenos", "senos"]),
  })
  .strict();
export type TriangleState = z.infer<typeof triangleStateSchema>;
export const radians = (degrees: number) => (degrees * Math.PI) / 180;
export function parseTriangle(launch: ToolLaunch, raw: unknown) {
  assertMode(launch, "L18", triangleModes);
  const state = triangleStateSchema.parse(raw);
  if (["cateto-desconhecido", "altura-para-area"].includes(launch.mode) && state.c <= state.a)
    throw new Error("A hipotenusa deve ser maior que o cateto conhecido.");
  if (["classificar-distancias", "construcoes"].includes(launch.mode))
    triangleFromSides(state.a, state.b, state.c);
  if (launch.mode === "circulos-e-tangentes" && state.distance <= state.radius)
    throw new Error("O ponto externo deve estar além do raio da circunferência.");
  if (launch.mode === "angulos-notaveis" && ![30, 45, 60].includes(state.angle))
    throw new Error("Escolha 30°, 45° ou 60° nesta experiência.");
  if (
    launch.mode === "lei-senos-cossenos" &&
    state.law === "senos" &&
    state.angle + state.secondAngle >= 180
  )
    throw new Error("A soma dos dois ângulos deve ser menor que 180°.");
  if (launch.mode === "alturas-distancias-navegacao" && state.angle >= 90)
    throw new Error("O ângulo de elevação deve ser menor que 90°.");
  return state;
}
export function triangleMeasures(launch: ToolLaunch, s: TriangleState) {
  const m = launch.mode;
  if (m === "cateto-desconhecido" || m === "altura-para-area") {
    const height = Math.sqrt(s.c ** 2 - s.a ** 2);
    return {
      base: m === "altura-para-area" ? 2 * s.a : s.a,
      x: m === "altura-para-area" ? s.a : 0,
      height,
      third: s.c,
      area: (m === "altura-para-area" ? s.a : s.a / 2) * height,
    };
  }
  if (["classificar-distancias", "construcoes"].includes(m)) {
    const result = triangleFromSides(s.a, s.b, s.c);
    return { base: s.c, x: result.x, height: result.height, third: s.a, area: result.area };
  }
  if (["area-seno", "lei-senos-cossenos"].includes(m)) {
    if (m === "lei-senos-cossenos" && s.law === "senos") {
      const sideB = (s.a * Math.sin(radians(s.secondAngle))) / Math.sin(radians(s.angle));
      const sideC =
        (s.a * Math.sin(radians(180 - s.angle - s.secondAngle))) / Math.sin(radians(s.angle));
      const result = triangleFromSides(s.a, sideB, sideC);
      return { base: sideC, x: result.x, height: result.height, third: sideB, area: result.area };
    }
    const x = s.b * Math.cos(radians(s.angle)),
      height = s.b * Math.sin(radians(s.angle));
    return {
      base: s.a,
      x,
      height,
      third: Math.sqrt(s.a ** 2 + s.b ** 2 - 2 * s.a * s.b * Math.cos(radians(s.angle))),
      area: (s.a * height) / 2,
    };
  }
  if (m === "alturas-distancias-navegacao") {
    const height = s.distance * Math.tan(radians(s.angle));
    return {
      base: s.distance,
      x: 0,
      height,
      third: Math.hypot(s.distance, height),
      area: (s.distance * height) / 2,
    };
  }
  if (m === "angulos-notaveis") {
    const height = s.b * Math.sin(radians(s.angle)),
      base = s.b * Math.cos(radians(s.angle));
    return { base, x: 0, height, third: s.b, area: (base * height) / 2 };
  }
  return { base: s.b, x: 0, height: s.a, third: Math.hypot(s.a, s.b), area: (s.a * s.b) / 2 };
}
export function triangleSummary(launch: ToolLaunch, s: TriangleState) {
  const m = launch.mode;
  if (m === "angulos-e-paralelas")
    return `Duas retas paralelas cortadas por uma transversal; ângulo marcado ${s.angle}°. Ângulos adjacentes na mesma reta somam 180°.`;
  if (m === "circulos-e-tangentes")
    return `Circunferência de raio ${s.radius}; distância do ponto externo ao centro ${s.distance}. O raio até o ponto de tangência é perpendicular à tangente.`;
  const shape = triangleMeasures(launch, s);
  return `Base ${formatNumber(shape.base)}, altura perpendicular ${formatNumber(shape.height)}, área ${formatNumber(shape.area)}. ${m === "lei-senos-cossenos" ? (s.law === "senos" ? `Lei dos senos; ângulos A=${s.angle}° e B=${s.secondAngle}°; lado a=${s.a} oposto a A.` : `Lei dos cossenos; lados ${s.a} e ${s.b}; ângulo incluído ${s.angle}°.`) : `Parâmetros a=${s.a}, b=${s.b}, c=${s.c}, ângulo ${s.angle}°.`} Medidas em unidades de comprimento; área em unidades quadradas.`;
}
export const trianglesTool: ToolModule = {
  family: "L18",
  modes: triangleModes,
  activity(launch) {
    assertMode(launch, "L18", triangleModes);
    const v = launch.variant;
    const state: TriangleState = {
      a: v ? 5 : 3,
      b: v ? 12 : 4,
      c: v ? 13 : 5,
      angle: v ? 45 : 30,
      secondAngle: 60,
      radius: 3 + v,
      distance: 5 + v * 3,
      ratio: v ? "cosseno" : "seno",
      law: v ? "senos" : "cossenos",
    };
    const prompts: Record<string, string> = {
      "catetos-hipotenusa-e-quadrados":
        "Os lados a e b são catetos de um triângulo retângulo. Construa um quadrado em cada lado. Qual é a hipotenusa? Compare a² + b² com a área do quadrado maior.",
      "cateto-desconhecido":
        "A hipotenusa c e um cateto a são conhecidos. Qual é o outro cateto? A hipotenusa é sempre maior que cada cateto; aqui c deve permanecer maior que a.",
      "alturas-diagonais":
        "Um retângulo tem lados a e b. A diagonal forma dois triângulos retângulos. Qual é o comprimento dessa diagonal?",
      "altura-para-area":
        "Um triângulo isósceles tem base 2a e lados iguais c. A altura divide a base ao meio. Qual é a área? Primeiro encontre a altura perpendicular; o lado inclinado não é a altura.",
      "classificar-distancias":
        "Construa um triângulo com lados a, b e c. Ele é acutângulo, retângulo ou obtusângulo? Compare o quadrado do maior lado com a soma dos quadrados dos outros dois.",
      "angulos-e-paralelas":
        "Duas paralelas são cortadas por uma transversal. O ângulo azul mede o valor indicado. Quanto mede o ângulo adjacente vermelho, que completa uma linha reta com ele? Compare também os correspondentes nas duas paralelas.",
      "circulos-e-tangentes":
        "De um ponto externo, trace uma tangente à circunferência. Conhecendo o raio e a distância ao centro, qual é o comprimento do segmento tangente? O raio no ponto de contato é perpendicular à tangente.",
      construcoes:
        "Construa o triângulo a partir das três medidas. Qual é sua área? A altura deve ser perpendicular à base; ela pode cair fora da base quando o triângulo é obtusângulo.",
      "razoes-triangulo":
        "No triângulo retângulo, o ângulo A fica no extremo direito da base. O cateto a é oposto a A, e b é adjacente. Calcule a razão escolhida (seno, cosseno ou tangente). Mudar a escala dos dois catetos pelo mesmo fator conserva a razão.",
      "angulos-notaveis":
        "Escolha 30°, 45° ou 60°. Qual é o seno do ângulo escolhido? Compare triângulos de tamanhos diferentes com o mesmo ângulo.",
      "lei-senos-cossenos":
        "Na lei dos cossenos, dados os lados a e b e o ângulo entre eles, encontre o terceiro lado. Na lei dos senos, dados A, B e o lado a oposto a A, encontre o lado b oposto a B. Escolha a lei no painel; os desenhos respeitam esses dados.",
      "area-seno":
        "São conhecidos dois lados a e b e o ângulo entre eles. Qual é a área? Projete um dos lados para obter a altura e compare com a·b·sen(ângulo)/2.",
      "alturas-distancias-navegacao":
        "A uma distância horizontal conhecida de uma torre, a linha de visão faz o ângulo indicado com o chão. Qual é a altura acima da linha horizontal do observador? O terreno é plano e a altura dos olhos não entra nessa diferença.",
    };
    return activity(
      launch.mode === "angulos-e-paralelas"
        ? "Uma transversal entre paralelas"
        : launch.mode === "circulos-e-tangentes"
          ? "Do centro até a tangente"
          : "Construir e medir triângulos",
      `${prompts[launch.mode] ?? ""} Para resultados irracionais, use 3 casas decimais.`,
      state,
      {
        answerLabel: ["altura-para-area", "construcoes", "area-seno"].includes(launch.mode)
          ? "Sua área em unidades quadradas"
          : ["razoes-triangulo", "angulos-notaveis"].includes(launch.mode)
            ? "Sua razão (sem unidade)"
            : launch.mode === "angulos-e-paralelas"
              ? "Seu ângulo em graus"
              : launch.mode === "classificar-distancias"
                ? "Classificação"
                : "Sua medida em unidades de comprimento",
        choices:
          launch.mode === "classificar-distancias"
            ? ["acutângulo", "retângulo", "obtusângulo"]
            : undefined,
        answerHint:
          "A unidade do campo já está incluída. Use decimal com vírgula ou uma fração; tolerância de 0,001 para aproximações.",
        rubric: [
          "Identificar as hipóteses: ângulo reto, paralelas, tangência ou dados lado–ângulo–lado.",
          "Distinguir lado, altura, área e razão.",
          "Conferir se as medidas formam uma construção possível.",
        ],
      },
    );
  },
  parse: parseTriangle,
  summarize(launch, raw) {
    return triangleSummary(launch, parseTriangle(launch, raw));
  },
  assess(launch, raw, answer) {
    const s = parseTriangle(launch, raw),
      m = launch.mode,
      summary = triangleSummary(launch, s);
    if (m === "classificar-distancias") {
      const sides = [s.a, s.b, s.c].sort((a, b) => a - b);
      const [a = 0, b = 0, c = 0] = sides;
      const difference = a * a + b * b - c * c;
      const expected =
        difference === 0 ? "retângulo" : difference > 0 ? "acutângulo" : "obtusângulo";
      return checked(
        normalized(answer) === normalized(expected),
        expected,
        `Ordene os lados: ${a}, ${b}, ${c}. Compare ${a * a + b * b} com ${c * c}; não aplique Pitágoras como igualdade antes de verificar o ângulo reto.`,
        summary,
      );
    }
    if (m === "angulos-e-paralelas")
      return numericChecked(
        answer,
        180 - s.angle,
        "Ângulos adjacentes que formam uma linha reta somam 180°. Ângulos correspondentes entre paralelas são iguais.",
        summary,
      );
    if (m === "circulos-e-tangentes")
      return numericChecked(
        answer,
        Math.sqrt(s.distance ** 2 - s.radius ** 2),
        "A distância ao centro é a hipotenusa; o raio e a tangente são catetos. Subtraia o quadrado do raio antes de extrair a raiz.",
        summary,
        0.001,
      );
    const shape = triangleMeasures(launch, s);
    if (m === "razoes-triangulo") {
      const hypotenuse = Math.hypot(s.a, s.b);
      const value =
        s.ratio === "seno"
          ? s.a / hypotenuse
          : s.ratio === "cosseno"
            ? s.b / hypotenuse
            : s.a / s.b;
      return numericChecked(
        answer,
        value,
        "Seno = oposto/hipotenusa; cosseno = adjacente/hipotenusa; tangente = oposto/adjacente. As razões não têm unidade.",
        summary,
        0.001,
      );
    }
    if (m === "angulos-notaveis")
      return numericChecked(
        answer,
        Math.sin(radians(s.angle)),
        "O seno depende do ângulo, não do tamanho do triângulo. Os valores para 30°, 45° e 60° são 1/2, √2/2 e √3/2.",
        summary,
        0.001,
      );
    if (["altura-para-area", "construcoes", "area-seno"].includes(m))
      return numericChecked(
        answer,
        shape.area,
        "Área = base × altura perpendicular / 2. Se os lados e o ângulo incluído forem conhecidos, a altura é um lado vezes o seno do ângulo.",
        summary,
        0.001,
      );
    if (m === "cateto-desconhecido" || m === "alturas-distancias-navegacao")
      return numericChecked(
        answer,
        shape.height,
        m === "cateto-desconhecido"
          ? "Use cateto² = hipotenusa² − outro cateto² e mantenha a raiz positiva."
          : "A tangente do ângulo é altura/distância horizontal; portanto, altura = distância × tangente.",
        summary,
        0.001,
      );
    return numericChecked(
      answer,
      shape.third,
      m === "lei-senos-cossenos"
        ? s.law === "senos"
          ? "a/sen(A) = b/sen(B). São conhecidos dois ângulos e um lado, o que determina o terceiro ângulo e os outros lados."
          : "c² = a² + b² − 2ab·cos(ângulo incluído). Pitágoras aparece quando esse ângulo é 90°."
        : "No triângulo retângulo, o quadrado da hipotenusa é a soma dos quadrados dos catetos.",
      summary,
      0.001,
    );
  },
};
