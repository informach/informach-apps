/**
 * Smoke test of the guided recording in the lesson window (Lote 9), in Electron with the app's
 * own modules: it serves tests/fixtures/guided-blockly.html (blocks in SVG that drag like
 * Blockly's), marks the targets through the DevTools protocol as F8 does, records a plan with a
 * click, a wait that holds the video, a drag from the flyout to below a block, typing, a click
 * with an expectation and a shortcut, at 1080p30 and at 1080p60, and then a take that continues
 * from the fourth step. For each take it checks the video, the cursor and guided-run.json and
 * measures the CPU and memory of every Electron process and of FFmpeg.
 *
 * It never moves the real pointer. Run from apps/ediaula with about 2 GB of memory free:
 *   node_modules/.bin/electron scripts/guided-smoke.mts
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { detectCaptureEncoder } from "../src/main/encoders.ts";
import { FFMPEG, probe } from "../src/main/ffmpeg.ts";
import { GuidedTake, openLessonCapture } from "../src/main/guidedCapture.ts";
import type { CdpDriver } from "../src/main/guidedCdp.ts";
import { listDisplays } from "../src/main/nativeHelper.ts";
import { normalizeCursorData } from "../src/shared/cursorData.ts";
import type { CaptureCodec } from "../src/shared/encoderChoice.ts";
import { normalizeGuidedRun } from "../src/shared/guidedCursor.ts";
import {
  DEFAULT_TEMPOS,
  type GuidedPlanV2,
  type GuidedStepV2,
  schedulePlan,
} from "../src/shared/guidedPlan.ts";
import { duplicationOutput } from "../src/shared/helperProtocol.ts";
import type { Locator } from "../src/shared/locators.ts";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "ediaula-guided-smoke-"));
app.setPath("userData", join(scratch, "userData"));

const checks: { name: string; ok: boolean; detail?: string }[] = [];
const step = (text: string): void => console.log(`· ${text}`);
const check = (name: string, ok: boolean, detail?: string): void => {
  checks.push({ name, ok, ...(detail ? { detail } : {}) });
};

function serve(): Promise<{ url: string; close: () => void }> {
  const page = readFileSync(join(appDir, "tests", "fixtures", "guided-blockly.html"));
  const server = createServer((request, response) => {
    if (!request.url?.startsWith("/aula")) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/aula`, close: () => server.close() });
    }),
  );
}

/** The element under `selector`, marked as F8 and a click in the inspect mode would. */
async function mark(cdp: CdpDriver, selector: string): Promise<Locator> {
  const { root } = await cdp.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
  const { nodeId } = await cdp.send<{ nodeId: number }>("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  if (!nodeId) throw new Error(`Nada em ${selector}`);
  const { model } = await cdp.send<{ model: { content: number[] } }>("DOM.getBoxModel", { nodeId });
  const q = model.content;
  const { node } = await cdp.send<{ node: { backendNodeId: number } }>("DOM.describeNode", {
    nodeId,
  });
  const marked = await cdp.mark(node.backendNodeId, { x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 });
  if (!marked.locator) throw new Error(`${selector}: ${marked.problem ?? "sem localizador"}`);
  return marked.locator;
}

const textLocator = (text: string, url: string): Locator => ({
  strategies: [{ by: "text", value: text }],
  url,
  point: { u: 0.5, v: 0.5 },
  fingerprint: {
    tag: "p",
    text,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    view: { width: 1920, height: 1080 },
    cursor: "auto",
  },
});

function powershell(command: string): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    ),
  );
}

/** CPU seconds and peak memory of FFmpeg, read while it still runs. */
async function ffmpegUsage(
  pid: number | undefined,
): Promise<{ cpu: number; peakMB: number } | null> {
  if (!pid) return null;
  const out = await powershell(
    `$p = Get-Process -Id ${pid}; "$($p.TotalProcessorTime.TotalSeconds);$($p.PeakWorkingSet64)"`,
  ).catch(() => "");
  const [cpu, peak] = out.split(";").map(Number);
  return Number.isFinite(cpu) ? { cpu, peakMB: Math.round(peak / 1024 ** 2) } : null;
}

interface Usage {
  wallSeconds: number;
  electronCores: number;
  ffmpegCores: number;
  totalCores: number;
  machinePercent: number;
  electronPeakMB: number;
  ffmpegPeakMB: number;
  byType: Record<string, number>;
  /** Peak memory of each kind of Electron process, MB. */
  memoryByType: Record<string, number>;
  /** Times the writer held for the encoder, and for how long in all. */
  encoderHolds?: number;
  encoderHeldSeconds?: number;
}

/** Samples every Electron process once a second while `work` runs. */
async function measured<T>(
  work: (stats: () => Promise<{ cpu: number; peakMB: number } | null>) => Promise<T>,
  pid: () => number | undefined,
): Promise<{ value: T; usage: Usage }> {
  const first = new Map<number, number>();
  const last = new Map<number, number>();
  const types = new Map<number, string>();
  let peak = 0;
  const memoryByType: Record<string, number> = {};
  const sample = (): void => {
    let memory = 0;
    const now: Record<string, number> = {};
    for (const m of app.getAppMetrics()) {
      const cpu = m.cpu.cumulativeCPUUsage ?? 0;
      if (!first.has(m.pid)) first.set(m.pid, cpu);
      last.set(m.pid, cpu);
      types.set(m.pid, m.type);
      memory += m.memory.workingSetSize;
      now[m.type] = (now[m.type] ?? 0) + m.memory.workingSetSize;
    }
    peak = Math.max(peak, memory);
    for (const [type, kb] of Object.entries(now))
      memoryByType[type] = Math.max(memoryByType[type] ?? 0, Math.round(kb / 1024));
  };
  sample();
  const started = performance.now();
  const timer = setInterval(sample, 1000);
  let encoder: { cpu: number; peakMB: number } | null = null;
  const value = await work(async () => {
    encoder = await ffmpegUsage(pid());
    return encoder;
  });
  clearInterval(timer);
  sample();
  const wall = (performance.now() - started) / 1000;
  const byType: Record<string, number> = {};
  let electron = 0;
  for (const [id, cpu] of last) {
    const used = cpu - (first.get(id) ?? cpu);
    electron += used;
    const type = types.get(id) ?? "?";
    byType[type] = Math.round(((byType[type] ?? 0) + used / wall) * 100) / 100;
  }
  const ffmpegCpu = (encoder as { cpu: number } | null)?.cpu ?? 0;
  const total = (electron + ffmpegCpu) / wall;
  return {
    value,
    usage: {
      wallSeconds: Math.round(wall * 10) / 10,
      electronCores: Math.round((electron / wall) * 100) / 100,
      ffmpegCores: Math.round((ffmpegCpu / wall) * 100) / 100,
      totalCores: Math.round(total * 100) / 100,
      machinePercent: Math.round((total / cpus().length) * 1000) / 10,
      electronPeakMB: Math.round(peak / 1024),
      ffmpegPeakMB: (encoder as { peakMB: number } | null)?.peakMB ?? 0,
      byType,
      memoryByType,
    },
  };
}

async function take(
  name: string,
  plan: GuidedPlanV2,
  from: number,
  codec: CaptureCodec,
): Promise<{ usage: Usage; label: string }> {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  const schedule = schedulePlan(plan, from);
  const phases = new Set<string>();
  let current: GuidedTake | null = null;
  const { value, usage } = await measured(
    async (stats) => {
      const guided = new GuidedTake({
        plan,
        from,
        dir,
        ffmpeg: FFMPEG,
        encoder: { codec },
        onStatus: (s) => {
          if (!phases.has(s.phase))
            step(
              `${name}: ${s.phase} (etapa ${s.step + 1}, ${s.time.toFixed(2)} s)${s.message ? `: ${s.message}` : ""}`,
            );
          phases.add(s.phase);
        },
      });
      current = guided;
      const end = await guided.ended;
      await stats();
      const result = await guided.stop();
      return { end, result, label: guided.label };
    },
    () => current?.encoderPid,
  );
  const { end, result, label } = value;
  check(`${name}: todas as etapas`, end.status === "done", end.message);
  check(`${name}: houve prévia e gravação`, phases.has("recording"), [...phases].join(","));
  if (!result.screen || !result.cursor || !result.guidedRun) {
    check(`${name}: arquivos da gravação`, false, JSON.stringify(result));
    return { usage, label };
  }
  const info = await probe(result.screen);
  check(
    `${name}: duração do vídeo = agenda`,
    Math.abs(info.duration - schedule.duration) <= 0.1,
    `${info.duration.toFixed(3)} s, agenda ${schedule.duration.toFixed(3)} s`,
  );
  check(
    `${name}: 1920x1080 a ${plan.fps}`,
    info.width === 1920 && info.height === 1080 && Math.round(info.fps) === plan.fps,
    `${info.width}x${info.height}@${info.fps}`,
  );
  const cursor = normalizeCursorData(JSON.parse(await readFile(result.cursor, "utf8")));
  const run = normalizeGuidedRun(JSON.parse(await readFile(result.guidedRun, "utf8")));
  check(
    `${name}: guided-run concluído`,
    run.status === "done" && run.steps.every((s) => s.status === "done"),
    run.steps.map((s) => s.status).join(","),
  );
  // Every click where the pointer is at that second.
  const at = (t: number) => [...cursor.moves].reverse().find((m) => m[0] <= t + 1e-6);
  const clicksOk = cursor.clicks.every(([t, x, y]) => {
    const m = at(t);
    return !!m && m[1] === x && m[2] === y;
  });
  check(
    `${name}: cursor no ponto de cada clique`,
    clicksOk && cursor.clicks.length > 0,
    JSON.stringify(cursor.clicks),
  );
  const planned = schedule.steps.filter((s) => ["click", "drag", "type"].includes(s.step.action));
  const clickTimes = cursor.clicks.map((c) => c[0]);
  const onTime = planned.every((s) => clickTimes.some((t) => Math.abs(t - s.actAt) < 0.005));
  check(
    `${name}: cliques no segundo da agenda`,
    onTime,
    `${clickTimes.join(", ")} / ${planned.map((s) => s.actAt.toFixed(3)).join(", ")}`,
  );
  const drag = cursor.clicks.find((c) => c[4] > 1);
  if (planned.some((s) => s.step.action === "drag"))
    // Pressing and releasing each take a frame for the page to acknowledge.
    check(
      `${name}: arrasto segurado o movimento inteiro`,
      !!drag &&
        drag[4] >= plan.tempos.move &&
        drag[4] <= plan.tempos.move + 3 / (plan.fps ?? 30) + 1e-3,
      JSON.stringify(drag),
    );
  check(
    `${name}: atalho com rótulo`,
    cursor.keys.some(([, label]) => label === "Ctrl+Z"),
    JSON.stringify(cursor.keys),
  );
  if (from === 0) {
    // The editor opens 5 s after the click, past the wait's own time: the video held for it,
    // unless the writer had already held as long for the encoder before that second.
    const hold = run.holds.find((h) => h.reason === "wait" && h.step === 1);
    const waitEnd = schedule.steps[1]?.endAt ?? 0;
    const encoderBefore = run.holds
      .filter((h) => h.reason === "encoder" && h.at <= waitEnd)
      .reduce((sum, h) => sum + h.duration, 0);
    check(
      `${name}: a espera segurou o vídeo`,
      (!!hold && hold.duration > 0) || encoderBefore > 1,
      JSON.stringify({
        holds: run.holds.filter((h) => h.reason !== "encoder"),
        encoderBefore: Math.round(encoderBefore * 100) / 100,
      }),
    );
  } else
    check(
      `${name}: retomada na etapa ${from + 1}`,
      run.from === from && run.steps[0].index === from,
      `from ${run.from}`,
    );
  const encoderHolds = run.holds.filter((h) => h.reason === "encoder");
  const held = encoderHolds.reduce((sum, h) => sum + h.duration, 0);
  console.log(
    `[${name}] ${label} · ${JSON.stringify(usage)} · codificador segurou ${encoderHolds.length}x, ${held.toFixed(2)} s`,
  );
  return {
    usage: {
      ...usage,
      encoderHolds: encoderHolds.length,
      encoderHeldSeconds: Math.round(held * 100) / 100,
    },
    label,
  };
}

async function main(): Promise<number> {
  // Every window of the smoke is offscreen and short-lived: closing one must not quit.
  app.on("window-all-closed", () => undefined);
  await app.whenReady();
  const server = await serve();
  try {
    // The encoder the recorder's detector picks for the main screen.
    let codec: CaptureCodec = "libx264";
    step("detectando o codificador");
    try {
      const list = await listDisplays(join(appDir, "resources", "native", "ediaula-helper.exe"));
      const monitor = list.monitors.find((m) => m.primary) ?? list.monitors[0];
      const output = monitor ? duplicationOutput(list, monitor) : -1;
      if (monitor && output >= 0)
        codec = (
          await detectCaptureEncoder({ output, width: monitor.w, height: monitor.h, fps: 60 })
        ).codec;
    } catch (error) {
      console.warn("Detector indisponível, usando x264:", error);
    }

    // Marking, as in the lesson window.
    const draft: GuidedPlanV2 = {
      version: 2,
      id: "smoke",
      name: "Blocos",
      mode: "web",
      url: server.url,
      viewport: { width: 1920, height: 1080 },
      fps: 30,
      steps: [],
      tempos: { ...DEFAULT_TEMPOS },
    };
    step(`codificador ${codec}; marcando os alvos`);
    const marking = await openLessonCapture(draft, 30);
    await marking.window.webContents.loadURL(`${server.url}?demora=0`);
    await marking.firstPaint;
    step("página aberta");
    const start = await mark(marking.cdp, '[data-testid="start"]');
    await marking.cdp.send("Runtime.evaluate", {
      expression: "document.querySelector('[data-testid=\"start\"]').click()",
    });
    await new Promise((r) => setTimeout(r, 300));
    const flyoutBlock = await mark(marking.cdp, ".blocklyFlyout g.blocklyDraggable");
    const hat = await mark(marking.cdp, ".blocklySvg g.blocklyDraggable.hat");
    const nameField = await mark(marking.cdp, "#name");
    const save = await mark(marking.cdp, "#save");
    marking.cdp.detach();
    marking.window.destroy();
    check(
      "marcação: Começar por test id",
      start.strategies[0]?.by === "testid",
      JSON.stringify(start.strategies),
    );
    check(
      "marcação: bloco do flyout pelo rótulo",
      JSON.stringify(flyoutBlock.strategies[0]) ===
        JSON.stringify({ by: "blockly", text: "mover passos", area: "flyout" }),
      JSON.stringify(flyoutBlock.strategies),
    );
    check(
      "marcação: papel e nome pela acessibilidade",
      save.strategies.some((s) => s.by === "role" && s.role === "button" && s.name === "Salvar"),
      JSON.stringify(save.strategies),
    );
    const below = {
      ...hat,
      strategies: hat.strategies.map((s) => (s.by === "blockly" ? { ...s, below: true } : s)),
    };

    const steps: GuidedStepV2[] = [
      { id: "1", at: 0, speech: "Clique em Começar.", action: "click", target: { locator: start } },
      {
        id: "2",
        at: 2,
        speech: "Espere o editor abrir.",
        action: "wait",
        until: { locator: flyoutBlock, state: "visible" },
        timeout: 15,
      },
      {
        id: "3",
        at: 6,
        speech: "Arraste o bloco mover para baixo do bloco amarelo.",
        action: "drag",
        target: { locator: flyoutBlock },
        to: { target: { locator: below } },
        expect: { locator: textLocator("Bloco encaixado", server.url), state: "visible" },
      },
      {
        id: "4",
        at: 11,
        speech: "Dê um nome ao projeto.",
        action: "type",
        value: "Minha aula",
        target: { locator: nameField },
      },
      {
        id: "5",
        at: 15.5,
        speech: "Clique em Salvar.",
        action: "click",
        target: { locator: save },
        expect: { locator: textLocator("Pronto", server.url), state: "visible" },
      },
      {
        id: "6",
        at: 18,
        speech: "Desfaça o encaixe com Ctrl+Z.",
        action: "key",
        chord: "Ctrl+Z",
        expect: { locator: textLocator("Desfeito", server.url), state: "visible" },
      },
    ];
    const plan30: GuidedPlanV2 = { ...draft, steps, fps: 30 };
    const plan60: GuidedPlanV2 = { ...draft, steps, fps: 60 };
    step("gravando a 1080p30");
    const r30 = await take("1080p30", plan30, 0, codec);
    step("gravando a 1080p60");
    const r60 = await take("1080p60", plan60, 0, codec);
    step("gravando a 1080p60 com a página parada");
    const still60 = await take(
      "1080p60-parada",
      { ...plan60, url: `${server.url}?animar=0` },
      0,
      codec,
    );
    step("gravando a 1080p30 com a página parada");
    const still30 = await take(
      "1080p30-parada",
      { ...plan30, url: `${server.url}?animar=0` },
      0,
      codec,
    );
    step("continuando da etapa 4");
    await take("continuar-da-etapa-4", plan30, 3, codec);
    console.log(
      JSON.stringify(
        {
          encoder: { detector: codec, used30: r30.label, used60: r60.label },
          "1080p30": r30.usage,
          "1080p60": r60.usage,
          "1080p30-parada": still30.usage,
          "1080p60-parada": still60.usage,
          checks,
          folder: scratch,
        },
        null,
        2,
      ),
    );
    return checks.every((c) => c.ok) ? 0 : 1;
  } finally {
    server.close();
  }
}

main().then(
  async (code) => {
    if (code === 0 && !process.env.EDIAULA_SMOKE_KEEP)
      await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    app.exit(code);
  },
  (error: unknown) => {
    console.error(error);
    app.exit(2);
  },
);
