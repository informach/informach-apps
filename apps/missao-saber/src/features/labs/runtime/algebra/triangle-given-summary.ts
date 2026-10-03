import type { ToolLaunch, ToolState } from "../types";
import { advancedTriangleModes, parseAdvancedTriangle } from "./advanced-triangles";
import { parseTriangle } from "./triangles";
export function triangleGivenSummary(launch: ToolLaunch, raw: ToolState): string {
  const mode = launch.mode;
  if (advancedTriangleModes.includes(mode)) {
    const s = parseAdvancedTriangle(launch, raw);
    if (s.kind === "projections")
      return `Triângulo retângulo; projeções na hipotenusa p=${s.p} e q=${s.q}.`;
    return s.shape === "rhombus"
      ? `Losango; diagonal horizontal ${s.diagonal}; ${s.known === "diagonals" ? `diagonal vertical ${s.otherDiagonal}` : `lado ${s.side}`}.`
      : `Trapézio ${s.shape === "right-trapezoid" ? "retângulo" : "isósceles"}; bases ${s.base} e ${s.top}; lado inclinado ${s.side}.`;
  }
  const s = parseTriangle(launch, raw);
  if (mode === "circulos-e-tangentes")
    return `Raio ${s.radius}; distância do ponto externo ao centro ${s.distance}; raio perpendicular à tangente.`;
  if (mode === "angulos-e-paralelas")
    return `Duas paralelas e uma transversal; ângulo indicado ${s.angle}°.`;
  if (mode === "alturas-distancias-navegacao")
    return `Distância horizontal ${s.distance}; ângulo de elevação ${s.angle}°.`;
  if (mode === "angulos-notaveis")
    return `Triângulo retângulo; hipotenusa ${s.b}; ângulo ${s.angle}°.`;
  if (mode === "lei-senos-cossenos" && s.law === "senos")
    return `Ângulos A=${s.angle}° e B=${s.secondAngle}°; lado a=${s.a}, oposto a A.`;
  if (["lei-senos-cossenos", "area-seno"].includes(mode))
    return `Lados ${s.a} e ${s.b}; ângulo incluído ${s.angle}°.`;
  if (mode === "altura-para-area")
    return `Triângulo isósceles; base 2×${s.a}; lados iguais ${s.c}.`;
  if (mode === "cateto-desconhecido")
    return `Triângulo retângulo; hipotenusa ${s.c}; cateto conhecido ${s.a}.`;
  if (["construcoes", "classificar-distancias"].includes(mode))
    return `Triângulo de lados a=${s.a}, b=${s.b}, c=${s.c}.`;
  return `Triângulo retângulo; catetos a=${s.a} e b=${s.b}.`;
}
