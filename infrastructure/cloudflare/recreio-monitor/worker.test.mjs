import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

if (process.env.CI !== "true") throw new Error("Executar somente no GitHub");
const { Miniflare } = createRequire(import.meta.url)("miniflare");
const scriptPath = fileURLToPath(new URL("./dist/worker.mjs", import.meta.url));
const bindings = {
  RECREIO_MONITOR_SENTRY_DSN: `https://${"1".repeat(32)}@o123.ingest.us.sentry.io/4512434887786496`,
  MORADA_MONITOR_SENTRY_DSN: `https://${"2".repeat(32)}@o123.ingest.us.sentry.io/4512434887917568`,
  MONITOR_PROVA_TRANSPORTE: "false",
};

async function cenario(opcoes, conferir) {
  const eventos = [];
  let pedidos = 0;
  let morada = 0;
  const servidor = createServer(async (pedido, resposta) => {
    pedidos++;
    resposta.setHeader("content-type", "application/json");
    if (pedido.url.startsWith("/api/")) {
      const partes = [];
      for await (const parte of pedido) partes.push(parte);
      const envelope = Buffer.concat(partes).toString("utf8").trimEnd().split("\n");
      eventos.push(JSON.parse(envelope[2]));
      resposta.statusCode = opcoes.ingestaoRecusada ? 429 : 202;
      resposta.end("{}");
      return;
    }
    const ehMorada = pedido.url === "/morada-server";
    if (ehMorada) morada++;
    resposta.statusCode = ehMorada && opcoes.indisponivel ? 503 : 200;
    resposta.end(
      JSON.stringify({
        status: resposta.statusCode === 200 ? "ready" : "unavailable",
        app: "recreio",
        naoRegistrar: "conteudo-privado",
      }),
    );
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const local = `http://127.0.0.1:${servidor.address().port}`;
  let mf;
  try {
    mf = new Miniflare({
      workers: [
        {
          config: {
            name: "informach-recreio-monitor",
            compatibilityDate: "2026-11-15",
            manifest: {
              mainModule: "worker.mjs",
              modules: {
                "worker.mjs": { type: "esm", contents: readFileSync(scriptPath, "utf8") },
              },
            },
            env: Object.fromEntries(
              Object.entries({ ...bindings, ...opcoes.bindings }).map(([nome, value]) => [
                nome,
                { type: "text", value },
              ]),
            ),
          },
          dev: {
            outboundService: {
              type: "fetcher",
              handler: async (pedido) => {
                const url = new URL(pedido.url);
                // Somente a fronteira de rede é substituída: Worker e HTTP da fixture são reais.
                const caminho = url.hostname.endsWith("sentry.io")
                  ? url.pathname
                  : url.hostname.startsWith("morada-server.")
                    ? "/morada-server"
                    : "/recreio";
                assert.ok(
                  [
                    "recreio.informach.com.br",
                    "morada-server.informach.com.br",
                    "o123.ingest.us.sentry.io",
                  ].includes(url.hostname),
                );
                return fetch(`${local}${caminho}`, {
                  method: pedido.method,
                  headers: pedido.headers,
                  body: pedido.method === "POST" ? await pedido.arrayBuffer() : undefined,
                  redirect: "manual",
                });
              },
            },
          },
        },
      ],
    });
    const worker = await mf.getWorker();
    const resultado = await worker.scheduled({ cron: "*/5 * * * *", scheduledTime: new Date() });
    await conferir({ resultado, eventos, pedidos, morada });
    assert.equal((await mf.dispatchFetch("http://monitor.test/")).status, 404);
  } finally {
    if (mf) await mf.dispose();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("cron real verifica ambos sem criar eventos quando estão prontos", async () => {
  await cenario({}, async ({ resultado, eventos, pedidos }) => {
    assert.equal(resultado.outcome, "ok");
    assert.equal(pedidos, 2);
    assert.equal(eventos.length, 0);
  });
});

test("prova do transporte chega a ambos com campos sanitizados", async () => {
  await cenario(
    { bindings: { MONITOR_PROVA_TRANSPORTE: "true" } },
    async ({ resultado, eventos }) => {
      assert.equal(resultado.outcome, "ok");
      assert.equal(eventos.length, 2);
      for (const evento of eventos) {
        assert.equal(evento.level, "info");
        assert.equal(evento.tags.origem, "cloudflare-worker");
        assert.doesNotMatch(
          JSON.stringify(evento),
          /conteudo-privado|naoRegistrar|request|cookie|email/,
        );
      }
    },
  );
});

test("indisponibilidade persistente repete, envia erro e reprova o cron", async () => {
  await cenario({ indisponivel: true }, async ({ resultado, eventos, morada }) => {
    assert.equal(resultado.outcome, "exception");
    assert.equal(morada, 3);
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].level, "error");
    assert.equal(eventos[0].tags.servico, "morada-server");
    assert.equal(eventos[0].tags.codigo, "HTTP");
  });
});

test("recusa da ingestão também reprova a execução", async () => {
  await cenario(
    { ingestaoRecusada: true, bindings: { MONITOR_PROVA_TRANSPORTE: "true" } },
    async ({ resultado }) => {
      assert.equal(resultado.outcome, "exception");
    },
  );
});

test("configuração ausente falha antes de fazer pedidos", async () => {
  await cenario({ bindings: { MORADA_MONITOR_SENTRY_DSN: "" } }, async ({ resultado, pedidos }) => {
    assert.equal(resultado.outcome, "exception");
    assert.equal(pedidos, 0);
  });
});
