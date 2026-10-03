import type { ToolModule } from "../types";
import { equationsFamilyTool } from "./equations-family";
import { functionsFamilyTool } from "./functions-family";
import { numbersTool } from "./numbers";
import { sequencesFamilyTool } from "./sequences-family";
import { trianglesFamilyTool } from "./triangles-family";
export const algebraTools: ToolModule[] = [
  equationsFamilyTool,
  sequencesFamilyTool,
  numbersTool,
  functionsFamilyTool,
  trianglesFamilyTool,
];
