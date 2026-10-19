import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  type ApprovalDialogOptions,
  createApprovalRequests,
  createRendererRequests,
  createToolQueue,
  dialogApproval,
  type RendererPort,
  windowPort,
} from "./ai-bridge.ts";

/** A task that runs until `release()` is called, recording when it starts and ends. */
function gate(log: string[], name: string) {
  let release = (): void => {};
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    task: async (): Promise<string> => {
      log.push(`${name}+`);
      await done;
      log.push(`${name}-`);
      return name;
    },
    release: () => release(),
  };
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("the order of tool calls", () => {
  it("runs writes and proposals one at a time, in the order they came", async () => {
    const queue = createToolQueue();
    const log: string[] = [];
    const a = gate(log, "w1");
    const b = gate(log, "w2");
    const first = queue.run("write", a.task);
    const second = queue.run("write", b.task);
    await tick();
    expect(log, "the second write waits").toEqual(["w1+"]);
    a.release();
    await first;
    await tick();
    expect(log).toEqual(["w1+", "w1-", "w2+"]);
    b.release();
    expect(await second).toBe("w2");
  });

  it("runs reads side by side but makes them wait for the write in progress", async () => {
    const queue = createToolQueue();
    const log: string[] = [];
    const r1 = gate(log, "r1");
    const r2 = gate(log, "r2");
    const reads = [queue.run("read", r1.task), queue.run("read", r2.task)];
    await tick();
    expect(log, "two reads at once").toEqual(["r1+", "r2+"]);
    const w = gate(log, "w");
    const write = queue.run("write", w.task);
    const r3 = gate(log, "r3");
    const late = queue.run("read", r3.task);
    await tick();
    expect(log, "a write waits for the reads already running").not.toContain("w+");
    r1.release();
    r2.release();
    await Promise.all(reads);
    await tick();
    expect(log).toContain("w+");
    expect(log, "a read after the write waits for it").not.toContain("r3+");
    w.release();
    await write;
    await tick();
    expect(log).toContain("r3+");
    r3.release();
    await late;
  });

  it("is not held by a failing call", async () => {
    const queue = createToolQueue();
    await expect(
      queue.run("write", async () => {
        throw new Error("falhou");
      }),
    ).rejects.toThrow("falhou");
    expect(await queue.run("write", async () => "depois")).toBe("depois");
    expect(await queue.run("read", async () => "leitura")).toBe("leitura");
  });
});

/** A renderer that records what it was sent and can go away. */
function renderer() {
  const sent: { channel: string; payload: unknown }[] = [];
  const events = new EventEmitter();
  let open = true;
  const port: RendererPort = {
    alive: () => open,
    send: (channel, payload) => {
      if (!open) throw new Error("closed");
      sent.push({ channel, payload });
    },
    onGone: (listener) => {
      events.once("gone", listener);
      return () => events.off("gone", listener);
    },
  };
  return {
    port,
    sent,
    close: () => {
      open = false;
      events.emit("gone");
    },
  };
}

type Call = { id: string; runId?: string };

describe("requests to the renderer", () => {
  const options = {
    channel: "ai:call",
    timeoutMs: 60,
    timeout: "late",
    gone: "gone",
  };

  it("routes the renderer's answer to its request, once", async () => {
    const r = renderer();
    const requests = createRendererRequests<Call, string>(options);
    const a = requests.request(r.port, { id: "a" });
    const b = requests.request(r.port, { id: "b" });
    expect(r.sent.map((s) => s.payload)).toEqual([{ id: "a" }, { id: "b" }]);
    expect(requests.resolve("b", "B")).toBe(true);
    expect(requests.resolve("b", "again")).toBe(false);
    expect(requests.resolve("a", "A")).toBe(true);
    expect(await Promise.all([a.answer, b.answer])).toEqual(["A", "B"]);
    expect(requests.size()).toBe(0);
  });

  it("answers on time and ends, or keeps the request open until the editor is done", async () => {
    const r = renderer();
    const ended: string[] = [];
    const ending = createRendererRequests<Call, string>({
      ...options,
      onEnd: (_port, id, how) => ended.push(`${id}:${how}`),
    });
    const short = ending.request(r.port, { id: "t" });
    expect(await short.answer).toBe("late");
    await short.settled;
    expect(ended).toEqual(["t:timeout"]);
    expect(ending.resolve("t", "too late")).toBe(false);

    const holding = createRendererRequests<Call, string>({ ...options, holdAfterTimeout: true });
    const held = holding.request(r.port, { id: "h" });
    let settled = false;
    void held.settled.then(() => {
      settled = true;
    });
    expect(await held.answer).toBe("late");
    await sleep(20);
    expect(settled, "the queue still waits for the editor").toBe(false);
    expect(holding.resolve("h", "feito")).toBe(true);
    await held.settled;
    expect(await held.answer, "the caller kept the first answer").toBe("late");
  });

  it("ends every request of a window that went away, and refuses a closed one at once", async () => {
    const r = renderer();
    const requests = createRendererRequests<Call, string>({ ...options, timeoutMs: 60_000 });
    const open = requests.request(r.port, { id: "x" });
    r.close();
    expect(await open.answer).toBe("gone");
    const late = requests.request(r.port, { id: "y" });
    expect(await late.answer).toBe("gone");
    expect(requests.size()).toBe(0);
  });

  it("cancels the requests of one run and closes the rest", async () => {
    const r = renderer();
    const ended: string[] = [];
    const requests = createRendererRequests<Call, string>({
      ...options,
      timeoutMs: 60_000,
      onEnd: (port, id, how) => {
        if (how === "cancel") port.send("ai:cancel", id);
        ended.push(how);
      },
    });
    const one = requests.request(r.port, { id: "1", runId: "run-a" });
    const two = requests.request(r.port, { id: "2", runId: "run-b" });
    expect(requests.cancel((call) => call.runId === "run-a", "parado")).toBe(1);
    expect(await one.answer).toBe("parado");
    expect(r.sent.at(-1)).toEqual({ channel: "ai:cancel", payload: "1" });
    requests.close("fechada");
    expect(await two.answer).toBe("fechada");
    expect(ended).toEqual(["cancel", "gone"]);
  });

  it("adapts an Electron window, which may already be closed", async () => {
    const contents = new EventEmitter();
    const sent: unknown[] = [];
    let destroyed = false;
    const port = windowPort({
      isDestroyed: () => destroyed,
      webContents: {
        send: (_channel, ...args) => sent.push(...args),
        once: (event, listener) => contents.once(event, listener),
        removeListener: (event, listener) => contents.removeListener(event, listener),
      },
    });
    const requests = createRendererRequests<Call, string>({ ...options, timeoutMs: 60_000 });
    const pending = requests.request(port, { id: "w" });
    expect(sent).toEqual([{ id: "w" }]);
    destroyed = true;
    contents.emit("render-process-gone");
    expect(await pending.answer).toBe("gone");
    expect(contents.listenerCount("destroyed"), "no listener left behind").toBe(0);
    expect(windowPort(null).alive()).toBe(false);
  });
});

describe("questions to the person", () => {
  const question = {
    client: "Claude Code",
    tool: "cut_text",
    title: "Cortar texto",
    summary: "Cortar texto: {}",
    details: "{}",
  };

  it("waits for the editor's answer and tells it to close the question", async () => {
    const r = renderer();
    const approvals = createApprovalRequests({ channel: "ai:approval", now: () => 1000 });
    const answer = approvals.ask(r.port, question);
    const shown = r.sent[0]?.payload as { id: string; expiresAt: number; tool: string };
    expect(shown.tool).toBe("cut_text");
    expect(shown.expiresAt).toBe(61_000);
    expect(approvals.answer(shown.id, { choice: "project", projectId: "p1" })).toBe(true);
    expect(await answer).toEqual({ choice: "project", projectId: "p1" });
    expect(r.sent[1]).toEqual({ channel: "ai:approval", payload: { id: shown.id, closed: true } });
  });

  it("denies without an answer in time or without a window", async () => {
    const r = renderer();
    const approvals = createApprovalRequests({ channel: "ai:approval", timeoutMs: 30 });
    expect(await approvals.ask(r.port, question)).toEqual({ choice: "deny", projectId: null });
    r.close();
    expect(await approvals.ask(r.port, question)).toEqual({ choice: "deny", projectId: null });
  });

  it("asks with a native dialog that closes itself when time runs out", async () => {
    const shown: ApprovalDialogOptions[] = [];
    let response = 0;
    const ask = dialogApproval({
      appName: "EdiFoto",
      scope: () => "documento",
      show: async (options) => {
        shown.push(options);
        return { response };
      },
    });
    expect(await ask(question)).toEqual({ choice: "once", projectId: "documento" });
    expect(shown[0]?.message).toBe("Claude Code quer: Cortar texto");
    expect(shown[0]?.buttons[shown[0].cancelId]).toBe("Negar");
    response = 1;
    expect(await ask(question)).toEqual({ choice: "project", projectId: "documento" });
    response = 2;
    expect(await ask(question)).toEqual({ choice: "deny", projectId: null });

    const silent = dialogApproval({
      appName: "EdiFoto",
      scope: () => "documento",
      timeoutMs: 20,
      // Electron answers a dialog closed by its signal with cancelId.
      show: (options) =>
        new Promise((resolve) =>
          options.signal.addEventListener("abort", () => resolve({ response: options.cancelId })),
        ),
    });
    expect(await silent(question)).toEqual({ choice: "deny", projectId: null });
    const nothingOpen = dialogApproval({
      appName: "EdiFoto",
      scope: () => null,
      show: async () => ({ response: 0 }),
    });
    expect(await nothingOpen(question)).toEqual({ choice: "deny", projectId: null });
  });
});
