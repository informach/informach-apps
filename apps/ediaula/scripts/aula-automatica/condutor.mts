/**
 * Condutor da aula automática: abre o EdiAula ou o EdiSVG licenciado num perfil de trabalho (como o
 * `pnpm edi:open` com EDI_OPEN_USER_DATA) e aceita comandos do Playwright por HTTP local.
 *
 *   node apps/ediaula/scripts/aula-automatica/condutor.mts ediaula   (porta 47998)
 *   node apps/ediaula/scripts/aula-automatica/condutor.mts edisvg    (porta 47999)
 *
 * POST /eval recebe o corpo de uma função assíncrona que recebe `ctx` (é o que o `comando.sh` manda).
 * Os diálogos nativos só são respondidos quando há resposta na fila (`ctx.answer`); sem ela, abrem de
 * verdade. Fechar o app encerra o condutor e apaga só a licença temporária.
 *
 * Variáveis: AULA_PERFIL_EDIAULA, AULA_PERFIL_EDISVG (pasta do perfil; padrão ~/EdiAula-teste/user-data e
 * ~/EdiSVG-teste/user-data), AULA_TELAS (onde as fotos vão; padrão .cache/aula-automatica/telas) e
 * PROVA_SKIP_BUILD=1 (não refaz o build).
 */
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ElectronApplication, Page } from "playwright";
import {
  createNativeHarness,
  nativeTooling,
  waitForStatus,
} from "../../../../scripts/edi/native-harness.mts";

const APPS = {
  ediaula: {
    label: "EdiAula",
    port: 47998,
    userData: process.env.AULA_PERFIL_EDIAULA ?? join(homedir(), "EdiAula-teste", "user-data"),
  },
  edisvg: {
    label: "EdiSVG",
    port: 47999,
    userData: process.env.AULA_PERFIL_EDISVG ?? join(homedir(), "EdiSVG-teste", "user-data"),
  },
} as const;

const which = process.argv[2] as keyof typeof APPS;
if (!(which in APPS)) {
  console.error("uso: condutor.mts ediaula|edisvg");
  process.exit(2);
}
const { label, port, userData } = APPS[which];
const LEASE = 8 * 3600;
const shots = process.env.AULA_TELAS ?? join(process.cwd(), ".cache", "aula-automatica", "telas");
mkdirSync(shots, { recursive: true });
const log = (m: string) => console.log(`[aula] ${new Date().toISOString().slice(11, 19)} ${m}`);

const { packageManager } = nativeTooling();
const harness = await createNativeHarness("edi-aula-", packageManager);
let app: ElectronApplication | undefined;
let finished = false;
async function finish(code: number) {
  if (finished) return;
  finished = true;
  for (const f of await harness.dispose()) console.error("[aula] limpeza:", f);
  process.exit(code);
}
process.once("SIGINT", () => void finish(0));
process.once("SIGTERM", () => void finish(0));

if (process.env.PROVA_SKIP_BUILD !== "1") {
  log(`build do ${label}`);
  await harness.build(which);
}
app = await harness.launch(which, { userData, suiteData: join(harness.root, "suite") });
app.process().stdout?.on("data", (c: Buffer) => process.stdout.write(c));
app.process().stderr?.on("data", (c: Buffer) => process.stderr.write(c));
app.once("close", () => {
  log(`${label} fechado`);
  void finish(0);
});

// Diálogos: resposta da fila quando houver; senão, o diálogo de verdade.
await app.evaluate(({ dialog }) => {
  const queue: { kind: string; value: unknown }[] = [];
  const calls: { kind: string; title: string; answered: boolean }[] = [];
  Reflect.set(globalThis, "__prova", { queue, calls });
  const opts = (a: unknown, b: unknown) => {
    const v = b ?? a;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  };
  const take = (kind: string, o: Record<string, unknown>) => {
    const i = queue.findIndex((q) => q.kind === kind);
    const answer = i < 0 ? undefined : queue.splice(i, 1)[0];
    calls.push({ kind, title: String(o.title ?? o.message ?? ""), answered: !!answer });
    return answer;
  };
  const open = dialog.showOpenDialog.bind(dialog);
  const save = dialog.showSaveDialog.bind(dialog);
  const message = dialog.showMessageBox.bind(dialog);
  Reflect.set(dialog, "showOpenDialog", async (a: never, b: never) => {
    const answer = take("open", opts(a, b));
    if (!answer) return b === undefined ? open(a) : open(a, b);
    return { canceled: false, filePaths: answer.value as string[] };
  });
  Reflect.set(dialog, "showSaveDialog", async (a: never, b: never) => {
    const answer = take("save", opts(a, b));
    if (!answer) return b === undefined ? save(a) : save(a, b);
    return { canceled: false, filePath: answer.value as string };
  });
  Reflect.set(dialog, "showMessageBox", async (a: never, b: never) => {
    const answer = take("message", opts(a, b));
    if (!answer) return b === undefined ? message(a) : message(a, b);
    return { response: answer.value as number, checkboxChecked: false };
  });
});

const first = await app.firstWindow({ timeout: 60_000 });
await first.waitForFunction(() => typeof window.ediSuite !== "undefined");
if ((await first.evaluate(async () => (await window.ediSuite.status()).state)) !== "licensed")
  await harness.seedLease(app, LEASE);
setInterval(() => {
  if (app) harness.seedLease(app, LEASE).catch((e: unknown) => console.error("[aula] licença:", e));
}, 20 * 60_000);

async function editor(): Promise<Page> {
  for (let i = 0; i < 240; i++) {
    const page = app
      ?.windows()
      .find((p) => p.url().startsWith("file:") && !p.url().includes("#recorder"));
    if (page) return page;
    await delay(250);
  }
  throw new Error("editor não abriu");
}
const ed = await editor();
await waitForStatus(ed, "licensed").catch(() => undefined);
log(`${label} aberto e licenciado`);

const ctx = {
  app,
  delay,
  shots,
  editor,
  windows: () => app?.windows() ?? [],
  recorder: () => app?.windows().find((p) => p.url().includes("#recorder")),
  answer: (kind: "open" | "save" | "message", value: unknown) =>
    app?.evaluate(
      (_e, a) => {
        (Reflect.get(globalThis, "__prova") as { queue: unknown[] }).queue.push(a);
      },
      { kind, value },
    ),
  dialogs: () =>
    app?.evaluate(() => (Reflect.get(globalThis, "__prova") as { calls: unknown[] }).calls),
  state: {} as Record<string, unknown>,
};

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/eval") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", async () => {
    try {
      const result = await new AsyncFunction("ctx", body)(ctx);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: result ?? null }, null, 1));
    } catch (error) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String((error as Error)?.stack ?? error) }));
    }
  });
}).listen(port, "127.0.0.1", () => log(`comandos em http://127.0.0.1:${port}/eval`));
