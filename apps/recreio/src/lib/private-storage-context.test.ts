import { describe, expect, it } from "vitest";
import { contextoDeCustodiaPrivadaPermitido as permitido } from "./private-storage-context";

const github = {
  CI: "true",
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "informach/informach-apps",
};
const railway = {
  RAILWAY_PROJECT_ID: "f4da4285-5b98-48b5-b03e-5be02f4e7c56",
  RAILWAY_ENVIRONMENT_ID: "174b2cb0-e1cd-410c-8764-d913e3af18d3",
  RAILWAY_SERVICE_ID: "50000000-0000-4000-8000-000000000001",
};
describe("fronteira física da custódia privada", () => {
  it("separa runner sintético e projeto produtivo sem aceitar flags cruzadas", () => {
    expect(permitido(github, "qualification")).toBe(true);
    expect(permitido(railway, "production")).toBe(true);
    for (const input of [{}, github, { ...github, ...railway }])
      expect(permitido(input, "production")).toBe(false);
    for (const input of [
      {},
      railway,
      { ...github, ...railway },
      { ...github, GITHUB_REPOSITORY: "outra/conta" },
      { ...github, RAILWAY_ENVIRONMENT_ID: "" },
    ])
      expect(permitido(input, "qualification")).toBe(false);
  });
  it("não confunde outro ambiente, projeto ou serviço ausente com produção", () => {
    for (const patch of [
      { RAILWAY_PROJECT_ID: "outro" },
      { RAILWAY_ENVIRONMENT_ID: "outro" },
      { RAILWAY_SERVICE_ID: undefined },
      { GITHUB_ACTIONS: "true" },
    ])
      expect(permitido({ ...railway, ...patch }, "production")).toBe(false);
    expect(permitido({ ...railway, CI: "true" }, "production")).toBe(true);
  });
});
