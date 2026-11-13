import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

// Verificação isolada do Recreio: cria um banco descartável no PostgreSQL
// local, aplica as migrations, roda a verificação pedida e apaga o banco.
//
// - `integration`: os testes de `test/*.integration.ts`, sem servidor.
// - `e2e`: build de produção com o jogo de teste ligado, `next start` numa
//   porta própria e o Playwright (`e2e/*.spec.ts`). O servidor do jogo de
//   teste e o servidor do Morada (`apps/morada-server`, como processo à parte)
//   são iniciados e derrubados pelos próprios testes. Nada sai da máquina: sem
//   Redis, sem envio de e-mail (os códigos ficam em arquivos) e sem segredo
//   guardado (tudo é gerado aqui, a cada execução).
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "../..");
loadEnv({ path: resolve(root, ".env") });
const mode = process.argv[2];
if (!["integration", "e2e"].includes(mode)) throw new Error("Choose integration or e2e");
const e2e = mode === "e2e";
const baseUrl = process.env.DATABASE_URL;
const pnpmCli = process.env.npm_execpath;
if (!baseUrl || !pnpmCli)
  throw new Error("Run with pnpm and a local DATABASE_URL (root .env supported)");
const url = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw new Error("Only explicitly local PostgreSQL administration is allowed");
const name = `recreio_review_${randomUUID().replaceAll("-", "")}`;
if (!/^recreio_review_[a-f0-9]{32}$/.test(name)) throw new Error("Invalid isolated database name");
const admin = postgres(baseUrl, { max: 1 });
url.pathname = `/${name}`;
function porta(nome, padrao) {
  const valor = process.env[nome] ?? padrao;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1024 || numero > 65535)
    throw new Error(`${nome} must be a local TCP port from 1024 to 65535`);
  return valor;
}
// Portas só da verificação: nem a 3009 do portal em desenvolvimento, nem a
// 3010 do servidor do Morada em desenvolvimento.
const e2ePort = porta("RECREIO_E2E_PORT", "3109");
const gamePort = porta("RECREIO_E2E_GAME_PORT", "3019");
const moradaPort = porta("RECREIO_E2E_MORADA_PORT", "3110");
const origin = e2e ? `http://localhost:${e2ePort}` : "http://localhost:3009";
const e2eRunId = e2e ? randomBytes(12).toString("hex") : "";
// Opt-in local: a arte e TODAS as capturas/traces ficam fora do checkout público.
const artDir =
  e2e && process.env.RECREIO_E2E_ARTE_DIR ? realpathSync(process.env.RECREIO_E2E_ARTE_DIR) : null;
function outsideRepository(path) {
  const rel = relative(realpathSync(root), realpathSync(path));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error("Private art and evidence must remain outside the public repository");
}
let privateArtifacts = null;
if (artDir) {
  outsideRepository(artDir);
  if (!existsSync(resolve(artDir, "manifest.json"))) throw new Error("Art manifest missing");
  privateArtifacts = resolve(artDir, "..", `recreio-evidence-${e2eRunId}`);
  mkdirSync(privateArtifacts, { recursive: true });
  outsideRepository(privateArtifacts);
}
// O que a execução cria dentro do app e apaga no fim.
const generatedPaths = e2e
  ? [
      resolve(app, `.next-isolated-${e2eRunId}`),
      resolve(app, `test-results-${e2eRunId}`),
      resolve(app, "tmp", `emails-e2e-${e2eRunId}`),
    ]
  : [];
for (const generatedPath of generatedPaths) {
  const pai = dirname(generatedPath);
  if (
    !/^(\.next-isolated|test-results|emails-e2e)-[a-f0-9]{24}$/.test(basename(generatedPath)) ||
    (pai !== app && pai !== resolve(app, "tmp"))
  )
    throw new Error("Refusing to use an unexpected isolated artifact path");
}
const [, resultsPath, emailsPath] = generatedPaths;
const testEnv = {
  DATABASE_URL: url.toString(),
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  SENDGRID_API_KEY: "SG.local-not-sent",
  SENDGRID_FROM: "Recreio <nao-responda@example.test>",
  // No E2E os códigos de acesso ficam em arquivos, onde o teste os lê.
  EMAIL_SANDBOX_MODE: e2e ? "sandbox" : "memory",
  ...(emailsPath ? { EMAIL_SANDBOX_DIR: emailsPath.replaceAll("\\", "/") } : {}),
  RECREIO_ACCESS_MODE: "fechado",
  SENTRY_AUTH_TOKEN: "",
  // Segredos e origens só deste teste. `jogo-de-teste` não está no catálogo:
  // os testes de integração que precisam de um segundo jogo o acrescentam por
  // conta própria. No E2E há dois jogos: o `teste`, que só existe com a
  // variável abaixo e cujo servidor (`e2e/servidor`) lê este mesmo ambiente, e
  // o Morada, cujo servidor de verdade (`apps/morada-server`) o teste inicia
  // com o segredo e o endereço daqui.
  RECREIO_HOST_SECRETS: JSON.stringify(
    e2e
      ? { teste: randomBytes(32).toString("hex"), morada: randomBytes(32).toString("hex") }
      : {
          morada: randomBytes(32).toString("hex"),
          "jogo-de-teste": randomBytes(32).toString("hex"),
        },
  ),
  RECREIO_GAME_ORIGINS: JSON.stringify(
    e2e
      ? {
          teste: { ws: `ws://localhost:${gamePort}` },
          morada: {
            ws: `ws://localhost:${moradaPort}`,
            ...(artDir ? { assets: `http://localhost:${moradaPort}` } : {}),
          },
        }
      : { morada: { ws: "ws://localhost:3010" }, "jogo-de-teste": { ws: "ws://localhost:3011" } },
  ),
  RECREIO_JOGO_DE_TESTE: e2e ? "1" : "0",
  CRON_SECRET: randomBytes(32).toString("hex"),
  RECREIO_E2E_RUN_ID: e2eRunId,
  RECREIO_E2E_PORT: e2ePort,
};
const childEnv = { ...process.env, ...testEnv, RECREIO_ISOLATED_TEST: "1" };
delete childEnv.MORADA_ARTE_DIR;
delete childEnv.RECREIO_E2E_PRIVATE_ARTIFACTS;
if (artDir) childEnv.MORADA_ARTE_DIR = artDir;
if (privateArtifacts) childEnv.RECREIO_E2E_PRIVATE_ARTIFACTS = privateArtifacts;
// Isolated verification must not inherit optional production transports. In
// particular, Better Auth stores sessions in Redis when REDIS_URL is present;
// that would bypass the disposable PostgreSQL database created above and make
// the run share state with the caller's environment.
// The token key is left out on purpose: the app generates a throwaway pair.
for (const key of [
  "REDIS_URL",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "RECREIO_TOKEN_PRIVATE_KEY",
  "RECREIO_TOKEN_KEY_ID",
  "RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS",
])
  delete childEnv[key];
function run(args, cwd) {
  const child = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw new Error(`Verification command failed: ${args.join(" ")} (exit ${child.status})`);
}
let created = false;
try {
  // The identifier is generated above and restricted by a closed regular expression.
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`[recreio] Isolated local database created: ${name}`);
  run(["--filter", "@informach/db", "db:migrate"], root);
  if (e2e) {
    run(["--filter", "@informach/morada-server", "build"], root);
    run(["exec", "next", "build"], app);
    // Mesmo artefato do Railway: o standalone precisa de public/ e static/.
    const buildPath = generatedPaths[0];
    const standalone = resolve(buildPath, "standalone/apps/recreio");
    cpSync(resolve(app, "public"), resolve(standalone, "public"), { recursive: true });
    cpSync(resolve(buildPath, "static"), resolve(standalone, basename(buildPath), "static"), {
      recursive: true,
    });
    run(["exec", "playwright", "test", ...process.argv.slice(3)], app);
  } else
    run(
      [
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        ...process.argv.slice(3),
      ],
      app,
    );
} catch (error) {
  // Os traces e as capturas de uma falha ficam em `tmp/verification`.
  if (privateArtifacts) {
    console.error(`[recreio] Private evidence preserved outside repository: ${privateArtifacts}`);
  } else if (resultsPath && existsSync(resultsPath)) {
    const evidence = resolve(app, "tmp/verification", e2eRunId);
    mkdirSync(evidence, { recursive: true });
    cpSync(resultsPath, evidence, { recursive: true });
    console.error(`[recreio] Failure traces and screenshots preserved: ${evidence}`);
  }
  throw error;
} finally {
  for (const generatedPath of generatedPaths)
    rmSync(generatedPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  if (created) {
    await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log(`[recreio] Removed isolated database ${name}`);
  }
  await admin.end();
}
