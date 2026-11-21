import { describe, expect, it } from "vitest";
import { configuracaoDoBackupDoProcesso } from "./backup-environment";

function fixture(production = false): Record<string, string | undefined> {
  const scope = production ? "production" : "qualification";
  return {
    CI: production ? undefined : "true",
    GITHUB_ACTIONS: production ? undefined : "true",
    GITHUB_REPOSITORY: production ? undefined : "informach/informach-apps",
    GITHUB_SHA: "a".repeat(40),
    RAILWAY_PROJECT_ID: production ? "f4da4285-5b98-48b5-b03e-5be02f4e7c56" : undefined,
    RAILWAY_ENVIRONMENT_ID: production ? "174b2cb0-e1cd-410c-8764-d913e3af18d3" : undefined,
    RAILWAY_SERVICE_ID: production ? "50000000-0000-4000-8000-000000000003" : undefined,
    RAILWAY_GIT_COMMIT_SHA: "b".repeat(40),
    DATABASE_URL: production
      ? "postgres://fixture:fixture@postgres.railway.internal/railway?sslmode=require"
      : `postgres://fixture:fixture@127.0.0.1/recreio_review_${"1".repeat(32)}?sslmode=disable`,
    RECREIO_BACKUP_MODE: "native",
    RECREIO_BACKUP_TIMEOUT_MS: "600000",
    RECREIO_BACKUP_MAX_BYTES: "1073741824",
    RECREIO_BACKUP_PHOTOGRAPH_MAX_BYTES: "4194304",
    RECREIO_BACKUP_MIN_INTERVAL_SECONDS: "21600",
    RECREIO_BACKUP_RETENTION_DAYS: "28",
    RECREIO_OBJECTS_MODE: "read",
    RECREIO_OBJECTS_SCOPE: scope,
    RECREIO_OBJECTS_BUCKET_ID: "50000000-0000-4000-8000-000000000001",
    RECREIO_OBJECTS_BUCKET: production ? "recreio-photo-fixture" : "recreio-homologacao-fixture",
    RECREIO_OBJECTS_ENDPOINT: "https://t3.storageapi.dev",
    RECREIO_OBJECTS_REGION: "auto",
    RECREIO_OBJECTS_PATH_STYLE: "1",
    RECREIO_OBJECTS_ACCESS_KEY: "fixture-photo-access",
    RECREIO_OBJECTS_SECRET_KEY: "fixture-photo-secret",
    RECREIO_OBJECTS_ACTIVE_KEY: "v1",
    RECREIO_OBJECTS_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 1).toString("base64") }),
    RECREIO_BACKUP_SCOPE: scope,
    RECREIO_BACKUP_BUCKET_ID: "50000000-0000-4000-8000-000000000002",
    RECREIO_BACKUP_BUCKET: production ? "recreio-archive-fixture" : "recreio-homologacao-fixture",
    RECREIO_BACKUP_ENDPOINT: "https://t3.storageapi.dev",
    RECREIO_BACKUP_REGION: "auto",
    RECREIO_BACKUP_PATH_STYLE: "1",
    RECREIO_BACKUP_ACCESS_KEY: "fixture-archive-access",
    RECREIO_BACKUP_SECRET_KEY: "fixture-archive-secret",
    RECREIO_BACKUP_ACTIVE_KEY: "v1",
    RECREIO_BACKUP_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 2).toString("base64") }),
  };
}
function zerar(config: ReturnType<typeof configuracaoDoBackupDoProcesso>) {
  for (const c of [config?.fotografias, config?.arquivo])
    for (const key of c?.chaves.values() ?? []) key.fill(0);
}

describe("standalone backup composition", () => {
  it("is off by default and never requires application/provider configuration while off", () => {
    expect(configuracaoDoBackupDoProcesso({})).toBeNull();
    expect(
      configuracaoDoBackupDoProcesso({ RECREIO_BACKUP_MODE: "off", DATABASE_URL: "invalid" }),
    ).toBeNull();
  });
  it("admits only explicit limited qualification and production contexts without changing the source environment", () => {
    for (const production of [false, true]) {
      const input = fixture(production),
        saved = { ...input };
      const config = configuracaoDoBackupDoProcesso(input);
      try {
        expect(config?.arquivo.escopo).toBe(production ? "production" : "qualification");
        expect(config?.fotografias.chaves.size).toBe(1);
        expect(config?.arquivo.chaves.size).toBe(1);
        expect(config?.intervaloSegundos).toBe(21600);
        expect(config?.retencaoDias).toBe(28);
        expect(input).toEqual(saved);
      } finally {
        zerar(config);
      }
    }
  });
  it("rejects foreign/implicit sources, missing bounds, app secrets and unknown modes with a constant error", () => {
    for (const patch of [
      { RECREIO_BACKUP_MODE: "enabled" },
      { GITHUB_ACTIONS: "false" },
      {
        DATABASE_URL:
          "postgres://fixture:fixture@192.0.2.10/recreio_review_deadbeef?sslmode=disable",
      },
      { DATABASE_URL: "postgres://fixture:fixture@127.0.0.1/other_ci_app?sslmode=disable" },
      { DATABASE_URL: `${fixture().DATABASE_URL}&host=192.0.2.10` },
      { RECREIO_BACKUP_MAX_BYTES: undefined },
      { RECREIO_BACKUP_TIMEOUT_MS: "900001" },
      { RECREIO_BACKUP_PHOTOGRAPH_MAX_BYTES: "4194305" },
      { RECREIO_BACKUP_RETENTION_DAYS: "0" },
      { RECREIO_BACKUP_RETENTION_DAYS: "89" },
      { RECREIO_BACKUP_MIN_INTERVAL_SECONDS: "0" },
      { STRIPE_SECRET_KEY: "fixture-secret-not-for-backup" },
      { BETTER_AUTH_SECRET: "fixture-secret-not-for-backup" },
      { SENDGRID_API_KEY: "fixture-secret-not-for-backup" },
    ])
      expect(() => configuracaoDoBackupDoProcesso({ ...fixture(), ...patch })).toThrow(
        "recreio.backup_environment.CONFIGURACAO",
      );
  });
  it("requires separate production buckets, encryption keys and credentials and the expected Railway environment", () => {
    const original = fixture(true);
    for (const patch of [
      { RAILWAY_PROJECT_ID: "foreign-project" },
      { RAILWAY_ENVIRONMENT_ID: "foreign-env" },
      { DATABASE_URL: original.DATABASE_URL?.replace("require", "disable") },
      { RECREIO_BACKUP_SCOPE: "qualification" },
      { RECREIO_BACKUP_BUCKET_ID: original.RECREIO_OBJECTS_BUCKET_ID },
      { RECREIO_BACKUP_BUCKET: original.RECREIO_OBJECTS_BUCKET },
      { RECREIO_BACKUP_KEYS: original.RECREIO_OBJECTS_KEYS },
      { RECREIO_BACKUP_ACCESS_KEY: original.RECREIO_OBJECTS_ACCESS_KEY },
      { RECREIO_BACKUP_SECRET_KEY: original.RECREIO_OBJECTS_SECRET_KEY },
    ])
      expect(() => configuracaoDoBackupDoProcesso({ ...original, ...patch })).toThrow(
        "recreio.backup_environment.CONFIGURACAO",
      );
  });
});
