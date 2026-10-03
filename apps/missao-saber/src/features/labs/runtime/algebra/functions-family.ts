import { advancedFunctionsTool } from "./advanced-functions";
import { combineTools } from "./combine-tools";
import { functionsTool } from "./functions";
export const functionsFamilyTool = combineTools(functionsTool, advancedFunctionsTool);
