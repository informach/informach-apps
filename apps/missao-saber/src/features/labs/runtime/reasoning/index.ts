import type { ToolModule } from "../types";
import { budgetTool } from "./budget";
import { combinatoricsTool } from "./combinatorics";
import { dataTool } from "./data";
import { financeTool } from "./finance";
import { logicTool } from "./logic";
import { probabilityTool } from "./probability";

export const reasoningTools: ToolModule[] = [
  combinatoricsTool,
  probabilityTool,
  dataTool,
  logicTool,
  budgetTool,
  financeTool,
];
