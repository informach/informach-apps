import { describe, expect, it } from "vitest";
import { fixtureDeMigracao } from "../../test/object-migration-apoio";
import { configuracaoDosObjetosDoProcesso } from "./object-environment";
import { configuracaoPublicaDoLeitor } from "./object-reader-configuration";

describe("evidência pública da composição do leitor", () => {
  it("expõe só fonte, destino técnico e identificadores de chaves", () => {
    const fixture = fixtureDeMigracao(),
      config = configuracaoDosObjetosDoProcesso(fixture);
    if (!config) throw new Error("Fixture unavailable");
    try {
      const publico = configuracaoPublicaDoLeitor(config, "a".repeat(40));
      expect(publico.reader).toEqual({
        scope: "qualification",
        bucketId: fixture.RECREIO_OBJECTS_BUCKET_ID,
        activeKey: "v1",
        keys: ["v1"],
      });
      const corpo = JSON.stringify(publico);
      for (const privado of [
        fixture.RECREIO_OBJECTS_ACCESS_KEY,
        fixture.RECREIO_OBJECTS_SECRET_KEY,
        fixture.RECREIO_OBJECTS_ENDPOINT,
        fixture.RECREIO_OBJECTS_BUCKET,
        ...[...config.chaves.values()].map((k) => k.toString("base64")),
      ])
        expect(corpo).not.toContain(privado);
      expect(() => configuracaoPublicaDoLeitor(config, "private-invalid")).toThrow(
        /^Invalid object reader configuration$/,
      );
    } finally {
      for (const key of config.chaves.values()) key.fill(0);
    }
  });
});
