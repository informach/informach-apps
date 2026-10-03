import type { ToolFamilyId, ToolModule } from "./types";

export async function loadTool(family: ToolFamilyId): Promise<ToolModule> {
  switch (family) {
    case "L01":
      return (await import("./elementary/counting")).countingTool;
    case "L02":
      return (await import("./elementary/fractions")).fractionsTool;
    case "L03":
      return (await import("./elementary/ratios")).ratiosTool;
    case "L04":
      return (await import("./elementary/measures")).measuresTool;
    case "L05":
      return (await import("./elementary/geometry")).geometryTool;
    case "L06":
      return (await import("./elementary/transforms")).transformsTool;
    case "L07":
      return (await import("./elementary/routes")).routesTool;
    case "L08":
      return (await import("./algebra/equations-family")).equationsFamilyTool;
    case "L09":
      return (await import("./algebra/sequences-family")).sequencesFamilyTool;
    case "L10":
      return (await import("./algebra/numbers")).numbersTool;
    case "L11":
      return (await import("./algebra/functions-family")).functionsFamilyTool;
    case "L12":
      return (await import("./reasoning/combinatorics")).combinatoricsTool;
    case "L13":
      return (await import("./reasoning/probability")).probabilityTool;
    case "L14":
      return (await import("./reasoning/data")).dataTool;
    case "L15":
      return (await import("./reasoning/logic")).logicTool;
    case "L16":
      return (await import("./reasoning/budget")).budgetTool;
    case "L17":
      return (await import("./reasoning/finance")).financeTool;
    case "L18":
      return (await import("./algebra/triangles-family")).trianglesFamilyTool;
    case "L19":
      return (await import("./elementary/solids")).solidsTool;
  }
}
