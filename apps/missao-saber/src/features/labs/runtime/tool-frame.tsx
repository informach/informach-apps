"use client";
import { Component, lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import type { LabToolProps, ToolFamilyId } from "./types";

class ToolBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div role="alert" className="rounded-controle border-2 border-coral p-4">
        <p>Não foi possível abrir a ferramenta. Sua investigação continua guardada nesta tela.</p>
        <button type="button" className="mt-2 min-h-11 underline" onClick={this.props.retry}>
          Tentar abrir a ferramenta novamente
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function loadRenderer(family: ToolFamilyId, _attempt: number) {
  // A new lazy loader lets a failed network request retry instead of reusing React's rejected promise.
  return lazy(async () => {
    switch (family) {
      case "L01":
        return { default: (await import("./elementary/counting-component")).CountingTool };
      case "L02":
        return { default: (await import("./elementary/fractions-component")).FractionsTool };
      case "L03":
        return { default: (await import("./elementary/ratios-component")).RatiosTool };
      case "L04":
        return { default: (await import("./elementary/measures-component")).MeasuresTool };
      case "L05":
        return { default: (await import("./elementary/geometry-component")).GeometryTool };
      case "L06":
        return { default: (await import("./elementary/transform-components")).TransformsTool };
      case "L07":
        return { default: (await import("./elementary/route-components")).RoutesTool };
      case "L08":
        return {
          default: (await import("./algebra/equation-family-component")).EquationFamilyTool,
        };
      case "L09":
        return {
          default: (await import("./algebra/sequence-family-component")).SequenceFamilyTool,
        };
      case "L10":
        return { default: (await import("./algebra/number-component")).NumberTool };
      case "L11":
        return {
          default: (await import("./algebra/function-family-component")).FunctionFamilyTool,
        };
      case "L12":
        return { default: (await import("./reasoning/count-component")).CountTool };
      case "L13":
        return { default: (await import("./reasoning/probability-component")).ProbabilityTool };
      case "L14":
        return { default: (await import("./reasoning/data-component")).DataTool };
      case "L15":
        return { default: (await import("./reasoning/logic-component")).LogicTool };
      case "L16":
        return { default: (await import("./reasoning/budget-component")).BudgetTool };
      case "L17":
        return { default: (await import("./reasoning/finance-component")).FinanceTool };
      case "L18":
        return {
          default: (await import("./algebra/triangle-family-component")).TriangleFamilyTool,
        };
      case "L19":
        return { default: (await import("./elementary/solid-components")).SolidsTool };
    }
  });
}
export function ToolFrame(props: LabToolProps) {
  const [attempt, setAttempt] = useState(0);
  const Tool = useMemo(
    () => loadRenderer(props.launch.family, attempt),
    [props.launch.family, attempt],
  );
  return (
    <ToolBoundary
      key={`${props.launch.family}-${attempt}`}
      retry={() => setAttempt((value) => value + 1)}
    >
      <Suspense fallback={<p role="status">Preparando a ferramenta…</p>}>
        <fieldset disabled={props.disabled} className="min-w-0 space-y-4">
          <legend className="sr-only">Controles da ferramenta</legend>
          <Tool {...props} />
        </fieldset>
      </Suspense>
    </ToolBoundary>
  );
}
