"use client";
import type { LabToolProps } from "../types";
import { AdvancedFunctionTool } from "./advanced-function-component";
import { advancedFunctionModes } from "./advanced-functions";
import { FunctionTool } from "./function-component";
export function FunctionFamilyTool(props: LabToolProps) {
  if (advancedFunctionModes.includes(props.launch.mode)) return <AdvancedFunctionTool {...props} />;
  return <FunctionTool {...props} />;
}
