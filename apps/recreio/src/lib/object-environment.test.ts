import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  configuracaoDosObjetos,
  configuracaoDosObjetosDoProcesso,
  objectEnvironmentSchema,
} from "./object-environment";

const base = {
  RECREIO_OBJECTS_MODE: "read",
  RECREIO_OBJECTS_SCOPE: "qualification",
  RECREIO_OBJECTS_BUCKET_ID: randomUUID(),
  RECREIO_OBJECTS_BUCKET: "recreio-homologacao-fixture",
  RECREIO_OBJECTS_ENDPOINT: "https://t3.storageapi.dev",
  RECREIO_OBJECTS_REGION: "auto",
  RECREIO_OBJECTS_PATH_STYLE: "0",
  RECREIO_OBJECTS_ACCESS_KEY: "fixture-access-key",
  RECREIO_OBJECTS_SECRET_KEY: "fixture-secret-key-never-real",
  RECREIO_OBJECTS_ACTIVE_KEY: "v1",
  RECREIO_OBJECTS_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }),
};
const configurar = (input: unknown) => configuracaoDosObjetos(objectEnvironmentSchema.parse(input));
describe("composição restrita dos objetos", () => {
  it("nasce desligada; não existe autorização de migração", () => {
    expect(configuracaoDosObjetosDoProcesso({})).toBeNull();
    expect(configurar({})).toBeNull();
    expect(configurar({ ...base, RECREIO_OBJECTS_MODE: "off" })).toBeNull();
    expect(() => configurar({ ...base, RECREIO_OBJECTS_MODE: "migrate" })).toThrow();
  });
  it("conserva destino, escopo e chaves canônicas para o leitor", () => {
    const config = configurar(base);
    expect(config).toMatchObject({
      bucketId: base.RECREIO_OBJECTS_BUCKET_ID,
      escopo: "qualification",
      pathStyle: false,
    });
    expect(config?.chaves.get("v1")).toHaveLength(32);
    expect(
      configurar({
        ...base,
        RECREIO_OBJECTS_SCOPE: "production",
        RECREIO_OBJECTS_BUCKET: "recreio-fotografias-fixture",
      })?.escopo,
    ).toBe("production");
  });
  it.each(Object.keys(base).filter((k) => k !== "RECREIO_OBJECTS_MODE"))(
    "recusa configuração incompleta: %s",
    (campo) => {
      const input: Record<string, string> = { ...base };
      delete input[campo];
      expect(() => configurar(input)).toThrow("Invalid RECREIO_OBJECTS configuration");
    },
  );
  it.each([
    "http://t3.storageapi.dev",
    "https://evil.example",
    "https://t3.storageapi.dev/path",
    "https://key:secret@t3.storageapi.dev",
    "https://t3.storageapi.dev?secret=1",
    "https://t3.storageapi.dev:8080",
  ])("recusa endpoint fora do contrato: %s", (endpoint) => {
    expect(() => configurar({ ...base, RECREIO_OBJECTS_ENDPOINT: endpoint })).toThrow(
      "Invalid RECREIO_OBJECTS configuration",
    );
  });
  it.each([
    { RECREIO_OBJECTS_KEYS: "JSON_PRIVADO_INVALIDO" },
    { RECREIO_OBJECTS_KEYS: "{}" },
    { RECREIO_OBJECTS_KEYS: JSON.stringify({ v1: randomBytes(31).toString("base64") }) },
    {
      RECREIO_OBJECTS_KEYS: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 17 }, (_, n) => [`v${n}`, randomBytes(32).toString("base64")]),
        ),
      ),
    },
    { RECREIO_OBJECTS_ACTIVE_KEY: "ausente" },
    { RECREIO_OBJECTS_SCOPE: "production" },
    { RECREIO_OBJECTS_BUCKET: "recreio-fotografias-fixture" },
  ])("recusa chave/escopo divergente sem imprimir o conteúdo", (mudanca) => {
    expect(() => configurar({ ...base, ...mudanca })).toThrow(
      /^Invalid RECREIO_OBJECTS configuration$/,
    );
  });
});
