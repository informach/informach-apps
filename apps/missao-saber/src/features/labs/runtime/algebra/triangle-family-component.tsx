"use client";
import type { LabToolProps } from "../types";
import { AdvancedTriangleTool } from "./advanced-triangle-component";
import { advancedTriangleModes } from "./advanced-triangles";
import { planeModes } from "./plane";
import { PlaneTool } from "./plane-component";
import { TriangleTool } from "./triangle-component";
export function TriangleFamilyTool(props: LabToolProps) {
  if (advancedTriangleModes.includes(props.launch.mode)) return <AdvancedTriangleTool {...props} />;
  if (planeModes.includes(props.launch.mode)) return <PlaneTool {...props} />;
  return <TriangleTool {...props} />;
}
