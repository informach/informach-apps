import { describe, expect, it } from "vitest";
import { configuracaoDoMonitorDeDireitos as ler } from "./rights-monitor-environment";

describe("alvo explícito da sonda de direitos", () => {
  it("fica desligada por padrão e não lê custódia para ficar desligada", () => {
    expect(ler({})).toBeNull();
    expect(
      ler({ RECREIO_RIGHTS_MONITOR_MODE: "off", RECREIO_RIGHTS_KEYRING: "invalid" }),
    ).toBeNull();
  });
  it("exige livro e idade explícitos sem serializar entrada inválida", () => {
    const input = {
      RECREIO_RIGHTS_MONITOR_MODE: "on",
      RECREIO_RIGHTS_LEDGER_ID: "50000000-0000-4000-8000-000000000001",
      RECREIO_RIGHTS_MONITOR_MAX_AGE_SECONDS: "900",
    };
    expect(ler(input)).toMatchObject({ idadeMaximaSegundos: 900 });
    for (const patch of [
      { RECREIO_RIGHTS_MONITOR_MODE: "invalid" },
      { RECREIO_RIGHTS_LEDGER_ID: "private-value" },
      { RECREIO_RIGHTS_MONITOR_MAX_AGE_SECONDS: undefined },
      { RECREIO_RIGHTS_MONITOR_MAX_AGE_SECONDS: "0" },
    ])
      expect(() => ler({ ...input, ...patch })).toThrow(/^Invalid rights monitor configuration$/);
  });
});
