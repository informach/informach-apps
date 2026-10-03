import type { ToolLaunch, ToolState } from "../types";
import { advancedEquationModes, parseAdvancedEquation } from "./advanced-equations";
import { parseEquation, polynomialModes, systemModes } from "./equations";
import { polynomialText } from "./polynomial-math";
export function equationGivenSummary(launch: ToolLaunch, raw: ToolState): string {
  const mode = launch.mode;
  if (launch.family === "L08") {
    if (advancedEquationModes.includes(mode)) {
      const s = parseAdvancedEquation(launch, raw);
      switch (s.kind) {
        case "polynomial":
          return `P(x)=${polynomialText(s.coefficients)}; divisor D(x)=${polynomialText(s.divisor)}; entrada ${s.input}.`;
        case "roots":
          return `P(x)=${s.leading}${s.roots.map((root) => `(x−(${root}))`).join("")}.`;
        case "power":
          return `P(x)=${s.factor}x^${s.exponent}+(${s.constant}); divisor x−(${s.root}).`;
        case "identity":
          return s.target === "difference-squares"
            ? `a=${s.left}; b=${s.right}.`
            : `a+b=${s.sum}; ab=${s.product}.`;
        case "radical":
          return `√(${s.a}x+(${s.b}))=${s.c}x+(${s.d}).`;
        case "substitution":
          return `${s.a}(x²+(${s.innerLinear})x)²+(${s.b})(x²+(${s.innerLinear})x)+(${s.c})=0.`;
        case "absolute":
          return s.target === "minimum"
            ? `|x−(${s.p})|+|x−(${s.q})|; ponto móvel x=${s.probe}.`
            : `|${s.a}x+(${s.b})| ${s.target === "equation" ? "=" : s.target === "closed" ? "≤" : "<"} ${s.radius}.`;
        case "nonlinear":
          return s.model === "sum-product"
            ? `x+y=${s.sum}; xy=${s.product}.`
            : `y=${s.slope}x+(${s.intercept}); (x−(${s.centerX}))²+(y−(${s.centerY}))²=${s.radius}².`;
      }
    }
    const s = parseEquation(launch, raw);
    if (systemModes.includes(mode)) return `${s.a}x+(${s.b})y=${s.c}; ${s.d}x+(${s.e})y=${s.f}.`;
    if (["fatoracao-raizes", "girard"].includes(mode)) return `(x−(${s.p}))(x−(${s.q})).`;
    if (mode === "identidades") return `(x+(${s.p}))².`;
    if (polynomialModes.includes(mode))
      return `${s.a}x²+(${s.b})x+(${s.c}); divisor de teste x−(${s.p}).`;
    if (mode === "modulo-radicais-e-dominio")
      return `${s.domainKind === "raiz" ? `√(x+(${s.a}))` : `|x+(${s.a})|`}=${s.b}.`;
    if (mode === "exponenciais-logaritmos") return `${s.a}^x=${s.b}.`;
    if (mode === "inequacoes") return `${s.a}x+(${s.b})<${s.c}.`;
    if (["trocas-equivalentes", "ordenar-pesos"].includes(mode))
      return `Massa de A=${s.p}, B=${s.q}, C=${s.d}.`;
    return `${s.a} caixas e ${s.b} unidades à esquerda; ${s.c} caixas e ${s.d} unidades à direita. ${["comparar-pratos", "massas"].includes(mode) ? `Massa de cada caixa: ${s.p}.` : "Descubra o valor de cada caixa para equilibrar os lados."}`;
  }
  throw new Error("Família incompatível com a descrição.");
}
