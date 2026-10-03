"use client";
import type { LabToolProps } from "../types";
import { AdvancedSequenceTool } from "./advanced-sequence-component";
import { advancedSequenceModes } from "./advanced-sequences";
import { SequenceTool } from "./sequence-component";
export function SequenceFamilyTool(props: LabToolProps) {
  if (advancedSequenceModes.includes(props.launch.mode)) return <AdvancedSequenceTool {...props} />;
  return <SequenceTool {...props} />;
}
