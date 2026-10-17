import { describe, expect, it } from "vitest";
import { formatInstallerSize, windowsPublisherCertified } from "./format";

describe("download presentation", () => {
  it("only treats an Authenticode subject as a Windows-recognised publisher", () => {
    expect(windowsPublisherCertified("Informach — sem Authenticode")).toBe(false);
    expect(windowsPublisherCertified("CN=Informach Ltda, O=Informach Ltda, C=BR")).toBe(true);
  });
  it("shows installer sizes in megabytes", () => {
    expect(formatInstallerSize(148_897_792)).toBe("142 MB");
    expect(formatInstallerSize(5 * 1024 ** 2 + 400 * 1024)).toBe("5,4 MB");
  });
});
