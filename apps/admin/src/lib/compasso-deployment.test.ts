import { describe, expect, it } from "vitest";
import { serviceKeysForDeployment } from "./products";

describe("independent deployment boundaries", () => {
  it("does not probe empty prepared services before the cutover", () => {
    const services = serviceKeysForDeployment({ compasso: false, recreio: false });
    expect(services).not.toContain("conta");
    expect(services).not.toContain("dia-de-estrela");
    expect(services).toContain("edi");
    expect(services).toContain("cozya");
  });
  it("monitors the central issuer and the new consumer without launching the games", () => {
    const services = serviceKeysForDeployment({ compasso: true, recreio: false });
    expect(services).toContain("conta");
    expect(services).toContain("dia-de-estrela");
    expect(services).not.toContain("recreio");
    expect(services).not.toContain("morada-server");
    expect(services).toContain("edi");
  });
  it("does not enable Compasso probes when only the game platform launches", () => {
    const services = serviceKeysForDeployment({ compasso: false, recreio: true });
    expect(services).toContain("recreio");
    expect(services).toContain("morada-server");
    expect(services).not.toContain("conta");
  });
});
