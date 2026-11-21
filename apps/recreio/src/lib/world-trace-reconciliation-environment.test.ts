import { expect, it } from "vitest";
import { configuracaoDaConciliacaoDeRastros } from "./world-trace-reconciliation-environment";

const fixture = {
  RECREIO_WORLD_TRACE_RECONCILIATION_MODE: "inspect",
  RAILWAY_PROJECT_ID: "f4da4285-5b98-48b5-b03e-5be02f4e7c56",
  RAILWAY_ENVIRONMENT_ID: "174b2cb0-e1cd-410c-8764-d913e3af18d3",
  RAILWAY_SERVICE_ID: "50000000-0000-4000-8000-000000000001",
  RAILWAY_GIT_COMMIT_SHA: "a".repeat(40),
  DATABASE_URL: "postgresql://fixture:fixture@postgres.railway.internal/railway?sslmode=require",
};
it("exige composição operacional explícita e TLS sem ativação por padrão", () => {
  expect(configuracaoDaConciliacaoDeRastros({})).toBeNull();
  expect(configuracaoDaConciliacaoDeRastros(fixture)?.modo).toBe("inspect");
  expect(
    configuracaoDaConciliacaoDeRastros({
      ...fixture,
      RECREIO_WORLD_TRACE_RECONCILIATION_MODE: "apply",
    })?.modo,
  ).toBe("apply");
  for (const alteracao of [
    { RECREIO_WORLD_TRACE_RECONCILIATION_MODE: "on" },
    { RAILWAY_ENVIRONMENT_ID: "50000000-0000-4000-8000-000000000002" },
    { RAILWAY_GIT_COMMIT_SHA: undefined },
    { DATABASE_URL: fixture.DATABASE_URL.replace("require", "disable") },
    { DATABASE_URL: fixture.DATABASE_URL.replace("postgres.railway.internal", "example.com") },
  ])
    expect(() => configuracaoDaConciliacaoDeRastros({ ...fixture, ...alteracao })).toThrow();
});
