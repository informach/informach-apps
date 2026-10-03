import { advancedEquationsTool } from "./advanced-equations";
import { combineTools } from "./combine-tools";
import { equationsTool } from "./equations";
export const equationsFamilyTool = combineTools(equationsTool, advancedEquationsTool);
