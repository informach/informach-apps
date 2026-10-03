"use client";
import type { LabToolProps } from "../types";
import { AdvancedEquationTool } from "./advanced-equation-component";
import { advancedEquationModes } from "./advanced-equations";
import { EquationTool } from "./equation-component";
export function EquationFamilyTool(props: LabToolProps) {
  if (advancedEquationModes.includes(props.launch.mode)) return <AdvancedEquationTool {...props} />;
  return <EquationTool {...props} />;
}
