import type { ToolLaunch, ToolState } from "../types";
import { advancedFunctionModes, parseAdvancedFunction } from "./advanced-functions";
import { functionSummary, parseFunction } from "./functions";
export function functionGivenSummary(launch: ToolLaunch, raw: ToolState): string {
  const mode = launch.mode;
  if (launch.family === "L11") {
    if (advancedFunctionModes.includes(mode)) {
      const s = parseAdvancedFunction(launch, raw);
      return s.kind === "relation"
        ? `Pares: ${s.pairs.map(({ x, y }) => `${x}→${y}`).join("; ")}.`
        : `f(x)=${s.a}x²+(${s.b})x+(${s.c}), para todo real x.${s.kind === "inequality" ? ` Resolva f(x) ${s.relation} 0.` : ""}`;
    }
    return functionSummary(launch, parseFunction(launch, raw));
  }
  throw new Error("Família incompatível com a descrição.");
}
