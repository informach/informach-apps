import { describe, expect, it } from "vitest";
import { installationAction } from "./installation-action";

describe("installation actions", () => {
  it("installs missing tools, opens current versions and updates older versions", () => {
    expect(installationAction(undefined)).toBe("install");
    const tool = {
      id: "edifoto",
      installed: true,
      version: "1.9.0",
      available: "1.10.0",
      busy: false,
      error: null,
    } as const;
    expect(installationAction(tool)).toBe("update");
    expect(installationAction({ ...tool, version: "1.10.0" })).toBe("open");
    expect(installationAction({ ...tool, version: "2.0.0" })).toBe("open");
  });
});
