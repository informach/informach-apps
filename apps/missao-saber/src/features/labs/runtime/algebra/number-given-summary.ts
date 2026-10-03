import type { ToolLaunch, ToolState } from "../types";
import { invariantModes, parseNumber } from "./numbers";
export function numberGivenSummary(launch: ToolLaunch, raw: ToolState): string {
  const mode = launch.mode;
  if (launch.family === "L10") {
    const s = parseNumber(launch, raw);
    if (mode === "mdc-mmc")
      return `Números ${s.n} e ${s.other}; investigar ${s.findLcm ? "MMC" : "MDC"}.`;
    if (mode === "primos-divisores") return `Número ${s.n}; procure seus divisores positivos.`;
    if (mode === "digitos-bases") return `Número decimal ${s.n}; escreva na base ${s.base}.`;
    if (["ciclos-e-algarismos", "modulo-potencias"].includes(mode))
      return `Potência ${s.n}^${s.exponent}; encontre o resto por ${s.modulus}.`;
    if (mode === "multiplas-condicoes")
      return `Restos exigidos ${s.remainderA} por ${s.divisor} e ${s.remainderB} por ${s.modulus}; encontre o menor inteiro não negativo.`;
    if (invariantModes.includes(mode))
      return `Partida ${s.n}; alvo ${s.other}; operações: somar ou subtrair ${s.step}.`;
    if (["classes-e-multiplos", "aritmetica-modular"].includes(mode))
      return `Começo ${s.n}; relógio de ${s.modulus} posições; passo de tamanho ${s.step}. ${mode === "aritmetica-modular" ? `Faça ${s.count} passos.` : "Investigue o primeiro retorno."}`;
    if (["paridade", "pares-e-restos"].includes(mode))
      return `${s.n} objetos; tente agrupá-los em pares.`;
    return `Quantidade ${s.n}; grupos de ${s.divisor}.`;
  }
  throw new Error("Família incompatível com a descrição.");
}
