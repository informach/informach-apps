import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { configuracaoDaMigracaoDeFotografias } from "@/lib/object-migration-environment";
import { configuracaoPublicaDoLeitor } from "@/lib/object-reader-configuration";
import { fixtureDeMigracao } from "../../../test/object-migration-apoio";
import { conferirLeitorPublicado } from "./leitor-publicado";

async function cenario(
  responder: (corpo: unknown) => { status: number; body: string; tipo?: string },
  conferir: (executar: () => Promise<void>, pedidos: () => number) => Promise<void>,
) {
  let config: ReturnType<typeof configuracaoDaMigracaoDeFotografias> | undefined,
    pedidos = 0;
  const servidor = createServer((pedido, resposta) => {
    pedidos++;
    expect(pedido.method).toBe("GET");
    expect(pedido.url).toBe("/api/objetos/configuracao");
    expect(pedido.headers.authorization).toBeUndefined();
    expect(pedido.headers.cookie).toBeUndefined();
    if (!config) throw new Error("Fixture unavailable");
    const r = responder(configuracaoPublicaDoLeitor(config.objetos, config.readerSource));
    resposta.writeHead(r.status, {
      "content-type": r.tipo ?? "application/json",
      Location: "/unexpected",
    });
    resposta.end(r.body);
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string") throw new Error("Fixture address unavailable");
  try {
    config = configuracaoDaMigracaoDeFotografias({
      ...fixtureDeMigracao(),
      RECREIO_OBJECTS_MIGRATION_READER_ORIGIN: `http://127.0.0.1:${endereco.port}`,
    });
    if (!config) throw new Error("Fixture unavailable");
    const atual = config;
    await conferir(
      () => conferirLeitorPublicado(atual),
      () => pedidos,
    );
  } finally {
    for (const key of config?.objetos.chaves.values() ?? []) key.fill(0);
    servidor.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      servidor.close((e) => (e ? reject(e) : resolve())),
    );
  }
}

describe("admissão da composição publicada do leitor", () => {
  it("confere HTTP real e a fonte/destino/chaves esperados", async () => {
    await cenario(
      (corpo) => ({ status: 200, body: JSON.stringify(corpo) }),
      async (executar, pedidos) => {
        await executar();
        expect(pedidos()).toBe(1);
      },
    );
  });
  it("recusa redirecionamento, excesso, resposta alheia e fonte alterada sem vazar corpo", async () => {
    for (const r of [
      { status: 302, body: "private-invalid" },
      { status: 503, body: "private-invalid" },
      { status: 200, body: "private-invalid" },
      { status: 200, body: "x".repeat(2049) },
      {
        status: 200,
        body: JSON.stringify({ status: "ready", app: "other", private: "private-invalid" }),
      },
      {
        status: 200,
        body: JSON.stringify({
          status: "ready",
          app: "recreio",
          source: "b".repeat(40),
          reader: {
            scope: "qualification",
            bucketId: "50000000-0000-4000-8000-000000000001",
            activeKey: "v1",
            keys: ["v1"],
          },
        }),
      },
      { status: 200, body: "{}", tipo: "text/html" },
    ])
      await cenario(
        () => r,
        async (executar, pedidos) => {
          await expect(executar()).rejects.toThrow(/^Published snapshot reader not confirmed$/);
          expect(pedidos()).toBe(1);
        },
      );
  });
});
