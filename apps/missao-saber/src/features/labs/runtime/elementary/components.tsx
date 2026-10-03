"use client";
import type { LabToolProps } from "../types";
import { CountingTool, FractionsTool, RatiosTool } from "./basic-components";
import { GeometryTool, MeasuresTool } from "./measurement-components";
import { RoutesTool } from "./route-components";
import { SolidsTool } from "./solid-components";
import { TransformsTool } from "./transform-components";

export function ElementaryTool(props: LabToolProps) {
  const tool = (() => {
    switch (props.launch.family) {
      case "L01":
        return <CountingTool {...props} />;
      case "L02":
        return <FractionsTool {...props} />;
      case "L03":
        return <RatiosTool {...props} />;
      case "L04":
        return <MeasuresTool {...props} />;
      case "L05":
        return <GeometryTool {...props} />;
      case "L06":
        return <TransformsTool {...props} />;
      case "L07":
        return <RoutesTool {...props} />;
      case "L19":
        return <SolidsTool {...props} />;
      default:
        throw new Error("Família não atendida pelas ferramentas elementares.");
    }
  })();
  return (
    <fieldset disabled={props.disabled} className="min-w-0 space-y-4">
      <legend className="sr-only">Controles da montagem</legend>
      {tool}
    </fieldset>
  );
}
