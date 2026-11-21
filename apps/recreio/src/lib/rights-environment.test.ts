import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { configuracaoDosDireitosDoProcesso as ler } from "./rights-environment";

function variaveis() {
  return {
    RECREIO_RIGHTS_MODE: "process",
    RECREIO_RIGHTS_SCOPE: "qualification",
    RECREIO_RIGHTS_LEDGER_ID: randomUUID(),
    RECREIO_RIGHTS_BUCKET: "recreio-homologacao",
    RECREIO_RIGHTS_ENDPOINT: "https://fixture.storageapi.dev",
    RECREIO_RIGHTS_REGION: "auto",
    RECREIO_RIGHTS_PATH_STYLE: "1",
    RECREIO_RIGHTS_ACCESS_KEY: "credencial-nao-publicar",
    RECREIO_RIGHTS_SECRET_KEY: "segredo-nao-publicar",
    RECREIO_RIGHTS_ACTIVE_KEY: "v1",
    RECREIO_RIGHTS_KEYRING: JSON.stringify([["v1", randomBytes(32).toString("base64")]]),
    RECREIO_RIGHTS_POLICY: "retirar-textos-fundacao-v1",
  };
}
describe("configuração operacional de direitos", () => {
  it("fica desligada sem carregar chaves ou depender do ambiente Next", () => {
    expect(ler({})).toBeNull();
    expect(ler({ RECREIO_RIGHTS_MODE: "off", RECREIO_RIGHTS_KEYRING: "inválido" })).toBeNull();
  });
  it("recusa custódia de homologação em um serviço Railway de produção", () => {
    expect(() =>
      ler({
        ...variaveis(),
        CI: "true",
        GITHUB_ACTIONS: "true",
        RAILWAY_PROJECT_ID: "f4da4285-5b98-48b5-b03e-5be02f4e7c56",
        RAILWAY_ENVIRONMENT_ID: "174b2cb0-e1cd-410c-8764-d913e3af18d3",
        RAILWAY_SERVICE_ID: randomUUID(),
      }),
    ).toThrow(/^Invalid RECREIO_RIGHTS configuration$/);
  });
  it("recusa custódia de produção fora do processo produtivo autorizado", () => {
    expect(() =>
      ler({
        ...variaveis(),
        RECREIO_RIGHTS_SCOPE: "production",
        RECREIO_RIGHTS_BUCKET: "recreio-direitos",
      }),
    ).toThrow(/^Invalid RECREIO_RIGHTS configuration$/);
  });
  it("carrega chaves próprias e separa qualificação de produção", () => {
    const v = variaveis(),
      config = ler(v);
    expect(config?.scope).toBe("qualification");
    expect(config?.pathStyle).toBe(true);
    expect(config?.chaves.get("v1")).toHaveLength(32);
    expect(
      ler({ ...v, RECREIO_RIGHTS_SCOPE: "production", RECREIO_RIGHTS_BUCKET: "recreio-direitos" })
        ?.scope,
    ).toBe("production");
    expect(() => ler({ ...v, RECREIO_RIGHTS_SCOPE: "production" })).toThrow(
      "Invalid RECREIO_RIGHTS configuration",
    );
    for (const k of config?.chaves.values() ?? []) k.fill(0);
  });
  it.each([
    "http://fixture.storageapi.dev",
    "https://externo.example",
    "https://fixture.storageapi.dev/objeto",
    "https://segredo@fixture.storageapi.dev",
    "https://fixture.storageapi.dev:8443",
    "https://fixture.storageapi.dev/?token=segredo",
    "url-invalida",
    "file:///segredo",
  ])("recusa endpoint fora do contrato sem expor entrada (%s)", (endpoint) => {
    expect(() => ler({ ...variaveis(), RECREIO_RIGHTS_ENDPOINT: endpoint })).toThrow(
      /^Invalid RECREIO_RIGHTS configuration$/,
    );
  });
  it("aceita o endpoint restrito da conta R2 sem ampliar o destino a URLs livres", () => {
    const c = ler({
      ...variaveis(),
      RECREIO_RIGHTS_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    });
    expect(c?.endpoint).toContain("r2.cloudflarestorage.com");
    for (const key of c?.chaves.values() ?? []) key.fill(0);
  });
  it("recusa rótulos repetidos, bits repetidos, chave ativa ausente e base64 não canônico", () => {
    const v = variaveis(),
      key = randomBytes(32).toString("base64");
    for (const entries of [
      [
        ["v1", key],
        ["v1", randomBytes(32).toString("base64")],
      ],
      [
        ["v1", key],
        ["v2", key],
      ],
      [["v2", key]],
      [["v1", `${"A".repeat(42)}B=`]],
    ])
      expect(() => ler({ ...v, RECREIO_RIGHTS_KEYRING: JSON.stringify(entries) })).toThrow(
        /^Invalid RECREIO_RIGHTS configuration$/,
      );
  });
  it("não inclui segredos nos erros de campos obrigatórios ou JSON inválido", () => {
    const v = variaveis();
    for (const campo of Object.keys(v)) {
      const entrada: Record<string, string | undefined> = { ...v, [campo]: undefined };
      if (campo === "RECREIO_RIGHTS_MODE") continue;
      expect(() => ler(entrada)).toThrow(/^Invalid RECREIO_RIGHTS configuration$/);
    }
    expect(() => ler({ ...v, RECREIO_RIGHTS_KEYRING: v.RECREIO_RIGHTS_SECRET_KEY })).toThrow(
      /^Invalid RECREIO_RIGHTS configuration$/,
    );
    expect(() => ler({ ...v, RECREIO_RIGHTS_MODE: "execute" })).toThrow(
      /^Invalid RECREIO_RIGHTS configuration$/,
    );
  });
});
