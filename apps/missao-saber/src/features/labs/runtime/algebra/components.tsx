"use client";
import type { LabToolProps } from "../types";
import { EquationFamilyTool } from "./equation-family-component";
import { FunctionFamilyTool } from "./function-family-component";
import { NumberTool } from "./number-component";
import { SequenceFamilyTool } from "./sequence-family-component";
import { TriangleFamilyTool } from "./triangle-family-component";
/** Aggregate entrypoint for complete-catalog rendering tests. Production loads one family. */
export function AlgebraTool(props: LabToolProps) {
  switch (props.launch.family) {
    case "L08":
      return <EquationFamilyTool {...props} />;
    case "L09":
      return <SequenceFamilyTool {...props} />;
    case "L10":
      return <NumberTool {...props} />;
    case "L11":
      return <FunctionFamilyTool {...props} />;
    case "L18":
      return <TriangleFamilyTool {...props} />;
    default:
      throw new Error("Família algébrica inválida.");
  }
}
