import { describe, expect, it } from "vitest";
import { MAX_TOOL_INSTANCES, runtimeLockName } from "./runtime-lock";

describe("runtime lock of a tool open in several windows", () => {
  it("keeps the tool's own name for window 1 and gives the others one each", () => {
    expect(runtimeLockName("edisvg")).toBe("edisvg.runtime");
    expect(runtimeLockName("edisvg", 1)).toBe("edisvg.runtime");
    expect(runtimeLockName("edisvg", 2)).toBe("edisvg.janela-2.runtime");
    expect(MAX_TOOL_INSTANCES).toBe(8);
  });
});
