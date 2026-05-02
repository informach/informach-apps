import { describe, expect, it } from "vitest";
import { createPostgresStore, MASTRA_SCHEMA_NAME, PostgresStore } from "../mastra";

describe("createPostgresStore", () => {
  it("retorna um PostgresStore sem abrir conexão (factory pura)", () => {
    // Constructor é síncrono e não dispara queries; pool subjacente é lazy.
    // Se isso quebrar, o build com env dummy também quebra (regressão crítica).
    const store = createPostgresStore({
      connectionString: "postgres://x:x@127.0.0.1:5432/x",
    });
    expect(store).toBeInstanceOf(PostgresStore);
  });

  it("usa schema 'ai_mastra' por default", () => {
    expect(MASTRA_SCHEMA_NAME).toBe("ai_mastra");
    // O schemaName não é exposto via getter público no PostgresStore, mas
    // garantimos a constante.
    const store = createPostgresStore({
      connectionString: "postgres://x:x@127.0.0.1:5432/x",
    });
    expect(store).toBeDefined();
  });

  it("aceita schemaName customizado e disableInit", () => {
    const store = createPostgresStore({
      connectionString: "postgres://x:x@127.0.0.1:5432/x",
      schemaName: "ai_test",
      disableInit: true,
      max: 5,
    });
    expect(store).toBeInstanceOf(PostgresStore);
  });
});
