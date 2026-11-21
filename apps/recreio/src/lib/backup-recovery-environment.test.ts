import { describe, expect, it } from "vitest";
import { configuracaoDaRecuperacaoDoBackup } from "./backup-recovery-environment";

const input = () => ({
  RECREIO_BACKUP_MODE: "restore",
  CI: "true",
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "informach/informach-apps",
  RECREIO_BACKUP_SCOPE: "qualification",
  RECREIO_BACKUP_BUCKET: "recreio-homologacao-fixture",
  RECREIO_BACKUP_BUCKET_ID: "60000000-0000-4000-8000-000000000001",
  RECREIO_BACKUP_ENDPOINT: "https://t3.storageapi.dev",
  RECREIO_BACKUP_REGION: "auto",
  RECREIO_BACKUP_PATH_STYLE: "1",
  RECREIO_BACKUP_ACCESS_KEY: "fixture-archive-access",
  RECREIO_BACKUP_SECRET_KEY: "fixture-archive-secret",
  RECREIO_BACKUP_ACTIVE_KEY: "v1",
  RECREIO_BACKUP_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 3).toString("base64") }),
  RECREIO_BACKUP_CAPTURE_ID: "60000000-0000-4000-8000-000000000002",
  RECREIO_BACKUP_TIMEOUT_MS: "600000",
  RECREIO_BACKUP_MAX_BYTES: "1073741824",
  RECREIO_BACKUP_PHOTOGRAPH_MAX_BYTES: "4194304",
});

describe("archive-only private recovery configuration", () => {
  it("admits only a selected archive without original-database or photograph credentials", () => {
    expect(configuracaoDaRecuperacaoDoBackup({})).toBeNull();
    const config = configuracaoDaRecuperacaoDoBackup(input());
    try {
      expect(config?.capturaId).toBe(input().RECREIO_BACKUP_CAPTURE_ID);
      expect(config?.rodadas).toBe(1);
    } finally {
      for (const key of config?.arquivo.chaves.values() ?? []) key.fill(0);
    }
  });
  it("rejects accidental original capabilities and unbounded/foreign recovery requests before runtime", () => {
    for (const key of [
      "DATABASE_URL",
      "RECREIO_BACKUP_DATABASE_URL",
      "PGHOST",
      "PGPASSWORD",
      "PGSERVICE",
      "PGPASSFILE",
      "BETTER_AUTH_SECRET",
      "SENDGRID_API_KEY",
      "STRIPE_SECRET_KEY",
      "RECREIO_OBJECTS_ACCESS_KEY",
      "RECREIO_OBJECTS_SECRET_KEY",
      "RECREIO_OBJECTS_KEYS",
    ])
      expect(() =>
        configuracaoDaRecuperacaoDoBackup({
          ...input(),
          [key]: "fixture-forbidden-original-capability",
        }),
      ).toThrow("recreio.backup_recovery_environment.CONFIGURACAO");
    for (const patch of [
      { RECREIO_BACKUP_MODE: "native" },
      { GITHUB_ACTIONS: "false" },
      { RECREIO_BACKUP_CAPTURE_ID: "arbitrary/object/path" },
      { RECREIO_BACKUP_RESTORE_ROUNDS: "3" },
      { RECREIO_BACKUP_RESTORE_ROUNDS: "0" },
      { RECREIO_BACKUP_TIMEOUT_MS: "900001" },
      { RECREIO_BACKUP_ENDPOINT: "http://127.0.0.1" },
    ])
      expect(() => configuracaoDaRecuperacaoDoBackup({ ...input(), ...patch })).toThrow(
        "recreio.backup_recovery_environment.CONFIGURACAO",
      );
  });
});
