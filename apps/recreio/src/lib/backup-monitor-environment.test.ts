import { describe, expect, it } from "vitest";
import { configuracaoDoMonitorDeBackup } from "./backup-monitor-environment";

function fixture(): Record<string, string | undefined> {
  return {
    CI: "true",
    GITHUB_ACTIONS: "true",
    RECREIO_BACKUP_MONITOR_MODE: "on",
    RECREIO_BACKUP_MONITOR_MAX_AGE_SECONDS: "25200",
    RECREIO_OBJECTS_SCOPE: "qualification",
    RECREIO_BACKUP_SCOPE: "qualification",
    RECREIO_OBJECTS_BUCKET_ID: "50000000-0000-4000-8000-000000000001",
    RECREIO_BACKUP_BUCKET_ID: "50000000-0000-4000-8000-000000000002",
    RECREIO_OBJECTS_BUCKET: "photo-fixture",
    RECREIO_BACKUP_BUCKET: "archive-fixture",
  };
}
describe("monitor sem capacidade de ler o arquivo", () => {
  it("é desligado por padrão e exige só identidades e limite explícitos", () => {
    expect(configuracaoDoMonitorDeBackup({})).toBeNull();
    expect(configuracaoDoMonitorDeBackup(fixture())?.idadeMaximaSegundos).toBe(25200);
    for (const campo of [
      "RECREIO_BACKUP_MONITOR_MODE",
      "RECREIO_BACKUP_MONITOR_MAX_AGE_SECONDS",
      "RECREIO_BACKUP_BUCKET_ID",
      "RECREIO_OBJECTS_BUCKET",
    ])
      expect(() => configuracaoDoMonitorDeBackup({ ...fixture(), [campo]: "invalid" })).toThrow();
  });
  it("recusa destinos iguais, escopos misturados e contexto não autorizado", () => {
    const f = fixture();
    for (const alteracao of [
      { RECREIO_BACKUP_BUCKET_ID: f.RECREIO_OBJECTS_BUCKET_ID },
      { RECREIO_BACKUP_SCOPE: "production" },
      { GITHUB_ACTIONS: "false" },
      { RECREIO_BACKUP_MONITOR_MAX_AGE_SECONDS: undefined },
    ])
      expect(() => configuracaoDoMonitorDeBackup({ ...f, ...alteracao })).toThrow();
  });
});
