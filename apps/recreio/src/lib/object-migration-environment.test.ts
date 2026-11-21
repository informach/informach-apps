import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixtureDeMigracao } from "../../test/object-migration-apoio";
import { configuracaoDaMigracaoDeFotografias as ler } from "./object-migration-environment";

describe("configuração separada da migração de fotografias", () => {
  it("off não admite escrita nem lê custódia inválida", () => {
    expect(ler({})).toBeNull();
    expect(
      ler({
        ...fixtureDeMigracao(),
        RECREIO_OBJECTS_MIGRATION_MODE: "off",
        RECREIO_OBJECTS_KEYS: "private-invalid",
      }),
    ).toBeNull();
  });
  it("limita lote, prazo, captura e origem sem misturar contextos", () => {
    const fixture = fixtureDeMigracao();
    const config = ler(fixture);
    expect(config?.batch).toBe(10);
    expect(config?.timeoutSeconds).toBe(300);
    for (const key of config?.objetos.chaves.values() ?? []) key.fill(0);
    for (const patch of [
      { DATABASE_URL: "postgresql://fixture:private@production.example/railway" },
      {
        DATABASE_URL:
          "postgresql://fixture:private@127.0.0.1/recreio_review_" +
          "a".repeat(32) +
          "?options=unsafe",
      },
      { RECREIO_OBJECTS_MODE: "off" },
      { RECREIO_OBJECTS_MIGRATION_MODE: "migrate" },
      { RECREIO_OBJECTS_MIGRATION_BACKUP_ID: "private-invalid" },
      { RECREIO_OBJECTS_MIGRATION_READER_SOURCE: "short" },
      { RECREIO_OBJECTS_MIGRATION_BATCH: "0" },
      { RECREIO_OBJECTS_MIGRATION_BATCH: "101" },
      { RECREIO_OBJECTS_MIGRATION_TIMEOUT_SECONDS: "901" },
      { RECREIO_OBJECTS_MIGRATION_READER_ORIGIN: "https://example.com" },
      { RECREIO_OBJECTS_MIGRATION_READER_ORIGIN: "http://localhost:3019/path" },
      { RECREIO_OBJECTS_MIGRATION_READER_ORIGIN: "http://user:pass@localhost:3019" },
      { RECREIO_OBJECTS_MIGRATION_READER_ORIGIN: "http://localhost:3019/?token=private-invalid" },
      { RAILWAY_PROJECT_ID: randomUUID() },
      { GITHUB_REPOSITORY: "foreign/repository" },
    ])
      expect(() => ler({ ...fixture, ...patch })).toThrow(
        /^Invalid snapshot migration configuration$/,
      );
  });
});
