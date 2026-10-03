import type { ToolModule } from "../types";
import { countingTool } from "./counting";
import { fractionsTool } from "./fractions";
import { geometryTool } from "./geometry";
import { measuresTool } from "./measures";
import { ratiosTool } from "./ratios";
import { routesTool } from "./routes";
import { solidsTool } from "./solids";
import { transformsTool } from "./transforms";

export const elementaryTools: ToolModule[] = [
  countingTool,
  fractionsTool,
  ratiosTool,
  measuresTool,
  geometryTool,
  transformsTool,
  routesTool,
  solidsTool,
];
export { adaptLegacyBars, adaptLegacyGrid } from "./legacy";
