import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  alvosDoMonitor,
  criarEnvelope,
  destinoSentry,
  enviarEnvelope,
  sondar,
  verificar,
} from "./sonda.mjs";

test("a sonda do backup é separada da prontidão e usa só ingestão do projeto Recreio", () => {
  assert.equal(alvosDoMonitor(undefined).length, 2);
  assert.equal(alvosDoMonitor("off").length, 2);
  const alvos = alvosDoMonitor("on");
  assert.equal(alvos.length, 3);
  assert.deepEqual(alvos[2], {
    servico: "recreio-backup",
    url: "https://recreio.informach.com.br/api/backup/health",
    app: "recreio",
    projeto: "4512434887786496",
    segredo: "RECREIO_MONITOR_SENTRY_DSN",
  });
  assert.throws(() => alvosDoMonitor("yes"), /CONFIGURACAO/);
});

async function comServidor(executarPedido, verificarServidor) {
  const servidor = createServer(executarPedido);
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const endereco = servidor.address();
  try {
    await verificarServidor(`http://127.0.0.1:${endereco.port}`);
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolve, reject) =>
      servidor.close((erro) => (erro ? reject(erro) : resolve())),
    );
  }
}

test("exige prontidão do serviço correto sem repassar a resposta", async () => {
  await comServidor(
    (pedido, resposta) => {
      assert.equal(pedido.headers.cookie, undefined);
      assert.equal(pedido.headers.authorization, undefined);
      assert.equal(pedido.headers["cache-control"], "no-cache");
      resposta.setHeader("content-type", "application/json; charset=utf-8");
      resposta.end(JSON.stringify({ status: "ready", app: "recreio", privado: "nao-repassar" }));
    },
    async (url) => {
      const resultado = await sondar({ url, app: "recreio" });
      assert.equal(resultado.ok, true);
      assert.equal(resultado.codigo, "PRONTO");
      assert.doesNotMatch(JSON.stringify(resultado), /privado|nao-repassar/);
      assert.equal((await sondar({ url, app: "outro" })).codigo, "PRONTIDAO");
    },
  );
});

test("não segue redirecionamentos nem aceita erro, HTML ou JSON sem prontidão", async () => {
  await comServidor(
    (pedido, resposta) => {
      const caminho = pedido.url;
      if (caminho === "/destino") assert.fail("redirecionamento foi seguido");
      if (caminho === "/redirecionamento") {
        resposta.writeHead(302, { location: "/destino" });
      } else if (caminho === "/erro") {
        resposta.writeHead(503, { "content-type": "application/json" });
      } else {
        resposta.setHeader("content-type", caminho === "/html" ? "text/html" : "application/json");
      }
      resposta.end(caminho === "/json" ? '{"status":"unavailable"}' : "texto privado");
    },
    async (url) => {
      for (const [caminho, codigo] of [
        ["redirecionamento", "HTTP"],
        ["erro", "HTTP"],
        ["html", "FORMATO"],
        ["json", "PRONTIDAO"],
        ["quebrado", "FORMATO"],
      ]) {
        assert.equal((await sondar({ url: `${url}/${caminho}` })).codigo, codigo);
      }
    },
  );
});

test("limita respostas declaradas, chunked e UTF-8 inválido", async () => {
  await comServidor(
    (pedido, resposta) => {
      resposta.setHeader("content-type", "application/json");
      if (pedido.url === "/declarado") resposta.setHeader("content-length", "2048");
      if (pedido.url === "/utf8") {
        resposta.end(Buffer.from([0xff]));
      } else {
        resposta.write(" ".repeat(1024));
        resposta.end(" ".repeat(1024));
      }
    },
    async (url) => {
      for (const caminho of ["declarado", "chunked"]) {
        assert.equal((await sondar({ url: `${url}/${caminho}` })).codigo, "TAMANHO");
      }
      assert.equal((await sondar({ url: `${url}/utf8` })).codigo, "FORMATO");
    },
  );
});

test("prazo cobre conexão e corpo que nunca termina", async () => {
  await comServidor(
    (pedido, resposta) => {
      if (pedido.url === "/corpo") {
        resposta.writeHead(200, { "content-type": "application/json" });
        resposta.write('{"status":');
      }
    },
    async (url) => {
      for (const caminho of ["cabecalhos", "corpo"]) {
        const resultado = await sondar({ url: `${url}/${caminho}` }, { prazoMs: 100 });
        assert.equal(resultado.codigo, "PRAZO");
      }
    },
  );
});

test("repete falhas transitórias e encerra no terceiro erro persistente", async () => {
  let pedidos = 0;
  await comServidor(
    (_pedido, resposta) => {
      pedidos++;
      resposta.writeHead(pedidos === 2 ? 200 : 503, { "content-type": "application/json" });
      resposta.end('{"status":"ready"}');
    },
    async (url) => {
      const resultado = await verificar({ url }, { intervaloMs: 1 });
      assert.equal(resultado.ok, true);
      assert.equal(resultado.tentativas, 2);
      const falha = await verificar({ url }, { intervaloMs: 1 });
      assert.equal(falha.ok, false);
      assert.equal(falha.tentativas, 3);
      assert.equal(pedidos, 5);
    },
  );
});

test("DSN só autoriza ingestão HTTPS no projeto esperado sem campos adicionais", () => {
  const chave = "1".repeat(32);
  const dsn = `https://${chave}@o123.ingest.us.sentry.io/456`;
  assert.equal(destinoSentry(dsn, "456").url, "https://o123.ingest.us.sentry.io/api/456/envelope/");
  for (const invalido of [
    undefined,
    "",
    dsn.replace("https:", "http:"),
    dsn.replace("/456", "/789"),
    `${dsn}?token=privado`,
    `${dsn}#fragmento`,
    dsn.replace("sentry.io", "sentry.io.example.test"),
    dsn.replace(`${chave}@`, `${chave}:senha@`),
    dsn.replace(".io/", ".io:8080/"),
  ])
    assert.throws(() => destinoSentry(invalido, "456"), /^Error: CONFIGURACAO_SENTRY$/);
});

test("entrega envelope real sem contexto de família ou resposta HTTP e detecta recusa", async () => {
  let pedidos = 0;
  await comServidor(
    async (pedido, resposta) => {
      pedidos++;
      assert.equal(pedido.method, "POST");
      assert.equal(pedido.headers["content-type"], "application/x-sentry-envelope");
      const partes = [];
      for await (const parte of pedido) partes.push(parte);
      const texto = Buffer.concat(partes).toString("utf8");
      const [cabecalho, item, payload] = texto.trimEnd().split("\n").map(JSON.parse);
      assert.equal(item.type, "event");
      assert.equal(item.length, Buffer.byteLength(JSON.stringify(payload)));
      assert.equal(cabecalho.event_id, payload.event_id);
      assert.equal(payload.environment, "production");
      assert.equal(payload.message, "recreio.external_readiness_failed");
      assert.equal(payload.level, "error");
      assert.deepEqual(payload.tags, {
        servico: "recreio",
        codigo: "HTTP",
        origem: "github-actions",
      });
      for (const campo of ["request", "user", "contexts", "exception", "extra", "breadcrumbs"]) {
        assert.equal(payload[campo], undefined);
      }
      if (pedidos === 2) resposta.statusCode = 429;
      if (pedidos === 3) resposta.setHeader("x-sentry-rate-limits", "60:error:organization");
      if (pedidos === 4) resposta.writeHead(302, { location: "/outro" });
      resposta.end("nao-imprimir");
    },
    async (url) => {
      const destino = { url, dsn: "https://chave@exemplo.test/456" };
      for (const esperado of [true, false, false, false]) {
        assert.equal(
          await enviarEnvelope(destino, criarEnvelope(destino, "recreio", "HTTP")),
          esperado,
        );
      }
      assert.equal(pedidos, 4);
      const prova = criarEnvelope(destino, "recreio", "PRONTO", true);
      assert.equal(JSON.parse(prova.corpo.split("\n")[2]).level, "info");
    },
  );
});
