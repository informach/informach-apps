import { advancedTrianglesTool } from "./advanced-triangles";
import { combineTools } from "./combine-tools";
import { planeTool } from "./plane";
import { trianglesTool } from "./triangles";
export const trianglesFamilyTool = combineTools(trianglesTool, advancedTrianglesTool, planeTool);
