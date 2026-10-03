import type { ToolLaunch, ToolState } from "../types";
import { advancedSequenceModes, parseAdvancedSequence } from "./advanced-sequences";
import { parseSequence, sequenceFormula } from "./sequences";
export function sequenceGivenSummary(launch: ToolLaunch, raw: ToolState): string {
  const mode = launch.mode;
  if (launch.family === "L09") {
    if (advancedSequenceModes.includes(mode)) {
      const s = parseAdvancedSequence(launch, raw);
      switch (s.kind) {
        case "stairs":
          return `${s.rows} fileiras; primeira com ${s.first} peças; cada nova fileira recebe mais ${s.step}.`;
        case "inverse":
          return `Saída ${s.output}. ${s.multiplyFirst ? `Multiplicar por ${s.multiplier}; depois somar ${s.increment}` : `Somar ${s.increment}; depois multiplicar por ${s.multiplier}`}.`;
        case "affine":
          return `Início ${s.start}; a cada passo multiplicar por ${s.multiplier} e somar ${s.increment}. Investigue ${s.steps} passos.`;
        case "hanoi":
          return `${s.disks} discos, da haste 1 para a 3; um disco por vez, sem colocar maior sobre menor. ${s.moves.length} movimentos feitos.`;
        case "block":
          return `Bloco mostrado na sequência; posição pedida ${s.position}, contada desde 1.`;
        case "figures":
          return `${s.a} quadrados de n por n, ${s.b} faixas de n peças e ${s.c} peças fixas; posição n=${s.position}.`;
        case "machine":
          return `Início ${s.start}; ${s.steps} passos. ${s.rule === "collatz" ? "Se o valor atual é par, divida por 2; se ímpar, multiplique por 3 e some 1" : "Some os algarismos do valor atual em cada passo"}.`;
        case "sum":
          return `Somar de k=1 até ${s.count}: ${{ squares: "k²", products: "k(k+1)", odds: "2k−1", multiples: `${s.factor}k`, telescoping: "1/[k(k+1)]" }[s.rule]}.`;
      }
    }
    const s = parseSequence(launch, raw);
    return `${sequenceFormula(s, launch.grade)} Posição pedida ${s.position}. ${mode === "pa-soma" || (mode === "pg-termo-soma" && s.showSum) ? "Some da primeira posição até a pedida." : ""}`;
  }
  throw new Error("Família incompatível com a descrição.");
}
