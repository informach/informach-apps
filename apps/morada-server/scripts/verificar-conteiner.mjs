import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { FECHAMENTO, SUBPROTOCOLO, VERSAO_DO_PROTOCOLO } from "@informach/morada-sim/protocolo";
import { MORADA_START_COMMAND } from "../../../.railway/morada-runtime.ts";

// Prova de processo/contêiner somente no executor remoto, nunca nesta máquina.
if (process.env.CI !== "true" || process.platform !== "linux" || !process.env.RUNNER_TEMP)
  throw new Error("Execute a prova de contêiner somente no GitHub Linux.");
const relatorio = process.env.MORADA_PROCESSO_RELATORIO;
if (
  !relatorio ||
  !path.isAbsolute(relatorio) ||
  path.relative(process.env.RUNNER_TEMP, relatorio).startsWith("..")
)
  throw new Error("O relatório deve ficar no diretório temporário do executor.");

const executar = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const nome = `morada-sigterm-${randomUUID()}`;
const imagem = "node:24.15.0-bookworm-slim";
async function docker(args) {
  const { stdout } = await executar("docker", args, {
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout.trim();
}
async function ate(condicao, prazo = 20_000) {
  const fim = performance.now() + prazo;
  while (performance.now() < fim) {
    if (await condicao()) return;
    await esperar(50);
  }
  throw new Error("A condição da prova de processo não foi confirmada no prazo.");
}
let socket;
let criado = false;
try {
  await docker(["pull", imagem]);
  await docker([
    "run",
    "--detach",
    "--name",
    nome,
    "--workdir",
    "/app",
    "--mount",
    `type=bind,source=${repo},target=/app,readonly`,
    "--publish",
    "127.0.0.1::3010",
    "--env",
    "NODE_ENV=test",
    "--env",
    "MORADA_PLATAFORMA=falsa",
    "--env",
    "LOG_LEVEL=debug",
    imagem,
    ...MORADA_START_COMMAND,
  ]);
  criado = true;
  const porta = await docker([
    "inspect",
    "--format",
    '{{(index (index .NetworkSettings.Ports "3010/tcp") 0).HostPort}}',
    nome,
  ]);
  assert.match(porta, /^\d+$/);
  const origem = `http://127.0.0.1:${porta}`;
  await ate(async () => {
    try {
      return (await fetch(`${origem}/api/ready`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {
      return false;
    }
  });
  const argumentos = JSON.parse(
    await docker([
      "exec",
      nome,
      "node",
      "-e",
      'process.stdout.write(JSON.stringify(require("node:fs").readFileSync("/proc/1/cmdline","utf8").split("\\0").filter(Boolean)))',
    ]),
  );
  assert.deepEqual(argumentos, [...MORADA_START_COMMAND]);
  const resposta = await fetch(`${origem}/dev/entrar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apelido: "Pessoa de teste" }),
  });
  assert.equal(resposta.status, 200);
  const entrada = await resposta.json();
  const quadros = [];
  let fechamento;
  socket = new WebSocket(`ws://127.0.0.1:${porta}`, SUBPROTOCOLO);
  socket.addEventListener("message", (evento) => quadros.push(JSON.parse(String(evento.data))));
  socket.addEventListener("close", (evento) => {
    fechamento = evento.code;
  });
  await ate(() => socket.readyState === WebSocket.OPEN);
  socket.send(
    JSON.stringify({
      t: "entrar",
      v: VERSAO_DO_PROTOCOLO,
      sessao: entrada.sessao,
      mundoId: entrada.mundoId,
    }),
  );
  await ate(() => quadros.some((quadro) => quadro.t === "fotografia"));
  const comandoId = "conteiner-fundacao-0001";
  socket.send(
    JSON.stringify({
      t: "intencao",
      intencao: {
        comandoId,
        mundoId: entrada.mundoId,
        moradorId: null,
        versaoEsperada: 0,
        acao: {
          t: "fundar_familia",
          rascunho: {
            nome: "Família de teste",
            moradores: [
              {
                nome: "Pessoa de teste",
                fase: "adulto",
                linha: "f",
                pele: 13008984,
                cabelo: "coque_alto",
                roupa: "casual_vestido",
                tracos: ["carinhoso"],
              },
            ],
            relacoes: [],
          },
        },
      },
    }),
  );
  await ate(() =>
    quadros.some((quadro) => quadro.t === "resultado" && quadro.resultado.comandoId === comandoId),
  );
  const resultado = quadros.find(
    (quadro) => quadro.t === "resultado" && quadro.resultado.comandoId === comandoId,
  );
  assert.equal(resultado.resultado.ok, true);
  const inicio = performance.now();
  await docker(["stop", "--time", "35", nome]);
  const encerrandoMs = performance.now() - inicio;
  assert.equal(await docker(["inspect", "--format", "{{.State.ExitCode}}", nome]), "0");
  await ate(() => fechamento !== undefined, 2000);
  assert.equal(fechamento, FECHAMENTO.reiniciando);
  const logs = (await docker(["logs", nome])).split("\n").flatMap((linha) => {
    try {
      return [JSON.parse(linha)];
    } catch {
      return [];
    }
  });
  assert(logs.some((linha) => linha.motivo === "SIGTERM"));
  assert(
    logs.some(
      (linha) => linha.evento === "instancia_encerrada" && linha.mundos === 1 && linha.falhas === 0,
    ),
  );
  const prova = {
    fonte: process.env.GITHUB_SHA,
    imagem,
    protocolo: VERSAO_DO_PROTOCOLO,
    argumentos,
    pidPrincipal: 1,
    mundoComFundacao: true,
    sinal: "SIGTERM",
    mundosConfirmados: 1,
    falhas: 0,
    codigoDeSaida: 0,
    fechamentoWebSocket: fechamento,
    encerrandoMs,
    limiteDoProcessoMs: 25_000,
    drenagemDoConteinerS: 35,
    escopo:
      "processo e protocolo reais; plataforma em memória isolada, sem prova de banco ou durabilidade após queda",
  };
  await mkdir(path.dirname(relatorio), { recursive: true });
  await writeFile(relatorio, `${JSON.stringify(prova, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(prova)}\n`);
} finally {
  socket?.close();
  if (criado) await docker(["rm", "--force", nome]);
}
