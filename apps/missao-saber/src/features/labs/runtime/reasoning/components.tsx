"use client";

import type { ReactNode } from "react";
import type { LabToolProps } from "../types";
import { BudgetTool } from "./budget-component";
import { CountTool } from "./count-component";
import { DataTool } from "./data-component";
import { FinanceTool } from "./finance-component";
import { LogicTool } from "./logic-component";
import { ProbabilityTool } from "./probability-component";

export function ReasoningTool(props: LabToolProps) {
  const family = props.launch.family;
  let tool: ReactNode;
  switch (family) {
    case "L12":
      tool = <CountTool {...props} />;
      break;
    case "L13":
      tool = <ProbabilityTool {...props} />;
      break;
    case "L14":
      tool = <DataTool {...props} />;
      break;
    case "L15":
      tool = <LogicTool {...props} />;
      break;
    case "L16":
      tool = <BudgetTool {...props} />;
      break;
    case "L17":
      tool = <FinanceTool {...props} />;
      break;
    default:
      throw new Error("Esta ferramenta não pertence ao grupo de raciocínio.");
  }
  return (
    <fieldset disabled={props.disabled} className="min-w-0">
      <legend className="sr-only">Controles da investigação</legend>
      {tool}
    </fieldset>
  );
}
