import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { configuracaoDaExportacao as ler } from "./export-environment";

describe("custódia do artefato pessoal", () => {
  it("fica desligada por padrão sem ler segredos incompletos", () => {
    expect(ler({})).toBeNull();
    expect(ler({ RECREIO_EXPORT_MODE: "off", RECREIO_EXPORT_KEYRING: "inválido" })).toBeNull();
  });
  it("admite rotação com cópias próprias e recusa rótulos/bits duplicados sem expor entrada", () => {
    const a = randomBytes(32).toString("base64"),
      b = randomBytes(32).toString("base64");
    const vars = {
      RECREIO_EXPORT_MODE: "native",
      RECREIO_EXPORT_ACTIVE_KEY: "nova",
      RECREIO_EXPORT_KEYRING: JSON.stringify([
        ["antiga", a],
        ["nova", b],
      ]),
    };
    const c = ler(vars);
    expect(c?.chaves.get("nova")).toEqual(Buffer.from(b, "base64"));
    for (const key of c?.chaves.values() ?? []) key.fill(0);
    for (const entradas of [
      [
        ["nova", a],
        ["nova", b],
      ],
      [
        ["antiga", a],
        ["nova", a],
      ],
      [["antiga", a]],
      [["nova", `${"A".repeat(42)}B=`]],
    ]) {
      expect(() => ler({ ...vars, RECREIO_EXPORT_KEYRING: JSON.stringify(entradas) })).toThrow(
        /^Invalid RECREIO_EXPORT configuration$/,
      );
    }
    expect(() => ler({ ...vars, RECREIO_EXPORT_MODE: "execute" })).toThrow(
      /^Invalid RECREIO_EXPORT configuration$/,
    );
    expect(() => ler({ ...vars, RECREIO_EXPORT_KEYRING: "segredo-nao-publicar" })).toThrow(
      /^Invalid RECREIO_EXPORT configuration$/,
    );
  });
});
