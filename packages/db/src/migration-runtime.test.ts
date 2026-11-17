import { expect, it } from "vitest";
import { createMigrationClient, migrationFailure } from "./migration-runtime";

it("não publica a conexão contida no erro real de uma URL inválida", async () => {
  const secret = "senha-nao-publicavel";
  let error: unknown;
  let client: ReturnType<typeof createMigrationClient> | undefined;
  try {
    client = createMigrationClient(`postgres://usuario:${secret}@host invalido/banco`);
  } catch (failure) {
    error = failure;
  } finally {
    await client?.end();
  }
  expect(error).toBeInstanceOf(TypeError);
  expect(migrationFailure(error)).toEqual({ code: "MIGRATION_FAILED" });
  expect(JSON.stringify(migrationFailure(error))).not.toContain(secret);
  expect(JSON.stringify(migrationFailure(error))).not.toContain("host invalido");
});
