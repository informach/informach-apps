import { describe, expect, it } from "vitest";
import {
  applyOutcome,
  classifyResponse,
  expiredKeys,
  MAX_QUEUE_AGE_MS,
  orderedForFlush,
  type PendingWrite,
  queueMessage,
  summarizeQueue,
  supersededKeys,
  visibleForOwner,
} from "./queue";

/** Agora, e não a época zero: a fila esquece o que passou da validade. */
const NOW = Date.now();

const entry = (over: Partial<PendingWrite> = {}): PendingWrite => ({
  key: "k1",
  taskId: "t1",
  userId: "u1",
  status: "done",
  version: 3,
  title: "Prova de Ciências",
  createdAt: NOW,
  state: "pending",
  ...over,
});

describe("classifyResponse", () => {
  it("treats a 200 with a receipt as the final answer", () => {
    expect(classifyResponse(200, { ok: true, value: { id: "t1" } })).toEqual({
      kind: "settled",
      ok: true,
    });
    expect(classifyResponse(200, { ok: false, error: { code: "VERSION_CONFLICT" } })).toEqual({
      kind: "settled",
      ok: false,
      code: "VERSION_CONFLICT",
    });
  });

  it("carries the new version, so the same card can undo right away", () => {
    expect(classifyResponse(200, { ok: true, value: { id: "t1", version: 4 } })).toEqual({
      kind: "settled",
      ok: true,
      version: 4,
    });
  });

  it("keeps the write queued when the session expired", () => {
    // O redirecionamento para o login devolve HTML com 200. Tratar isso como
    // sucesso apagaria a conclusão sem ela ter chegado a lugar nenhum.
    expect(classifyResponse(200, null)).toEqual({ kind: "retry" });
    expect(classifyResponse(200, "<!doctype html>")).toEqual({ kind: "retry" });
    expect(classifyResponse(401, { code: "UNAUTHORIZED" })).toEqual({ kind: "retry" });
  });

  it("keeps the write queued on rate limit and on our own failure", () => {
    expect(classifyResponse(429, { code: "RATE_LIMITED" })).toEqual({ kind: "retry" });
    expect(classifyResponse(500, { code: "WRITE_FAILED" })).toEqual({ kind: "retry" });
    expect(classifyResponse(502, null)).toEqual({ kind: "retry" });
  });

  it("stops insisting on a request that will never be understood", () => {
    expect(classifyResponse(400, { code: "INVALID_INPUT" })).toEqual({
      kind: "invalid",
      code: "INVALID_INPUT",
    });
    expect(classifyResponse(413, null)).toEqual({ kind: "invalid", code: "INVALID_INPUT" });
    // Origem recusada e rota inexistente não melhoram com o tempo: repetir
    // queimaria o limite de frequência e a barra diria "esperando a rede" para
    // sempre.
    expect(classifyResponse(403, { code: "FORBIDDEN" })).toEqual({
      kind: "invalid",
      code: "INVALID_INPUT",
    });
    expect(classifyResponse(404, null)).toEqual({ kind: "invalid", code: "INVALID_INPUT" });
  });
});

describe("applyOutcome", () => {
  it("removes what the server accepted", () => {
    expect(
      applyOutcome([entry(), entry({ key: "k2" })], "k1", { kind: "settled", ok: true }),
    ).toEqual([entry({ key: "k2" })]);
  });

  it("keeps what the server refused, marked, instead of losing it silently", () => {
    const [kept] = applyOutcome([entry()], "k1", {
      kind: "settled",
      ok: false,
      code: "VERSION_CONFLICT",
    });
    expect(kept).toMatchObject({ key: "k1", state: "conflict", errorCode: "VERSION_CONFLICT" });
  });

  it("leaves the queue untouched when nothing reached the server", () => {
    expect(applyOutcome([entry()], "k1", { kind: "retry" })).toEqual([entry()]);
  });

  it("marks a malformed request instead of retrying it forever", () => {
    const [kept] = applyOutcome([entry()], "k1", { kind: "invalid", code: "INVALID_INPUT" });
    expect(kept).toMatchObject({ state: "conflict", errorCode: "INVALID_INPUT" });
  });
});

describe("orderedForFlush", () => {
  it("sends in the order the person decided, and skips what is already refused", () => {
    const list = [
      entry({ key: "b", createdAt: NOW + 20 }),
      entry({ key: "a", createdAt: NOW + 10 }),
      entry({ key: "c", createdAt: NOW + 5, state: "conflict" }),
    ];
    expect(orderedForFlush(list).map((item) => item.key)).toEqual(["a", "b"]);
  });
});

describe("queueMessage", () => {
  it("says nothing when there is nothing waiting", () => {
    expect(queueMessage(summarizeQueue([]))).toBeNull();
  });

  it("counts what is waiting", () => {
    expect(queueMessage(summarizeQueue([entry()]))).toBe("1 mudança esperando a rede.");
    expect(queueMessage(summarizeQueue([entry(), entry({ key: "k2" })]))).toBe(
      "2 mudanças esperando a rede.",
    );
  });

  it("never counts a refused write as waiting for the network", () => {
    // O que está em conflito espera uma PESSOA. Somar os dois faria alguém
    // guardar o telefone achando que tudo ia subir.
    expect(queueMessage(summarizeQueue([entry({ state: "conflict" })]))).toBe(
      "1 mudança não pôde ser salva.",
    );
    expect(queueMessage(summarizeQueue([entry(), entry({ key: "k2", state: "conflict" })]))).toBe(
      "1 mudança esperando a rede, 1 precisa de você.",
    );
  });

  it("does not invite a tap — that is the caller's decision", () => {
    // No modo criança a barra é sobreposta e sem ponteiro.
    expect(queueMessage(summarizeQueue([entry()]))).not.toContain("Toque");
  });
});

describe("supersededKeys", () => {
  it("lets the last decision about the same activity win", () => {
    const list = [entry({ key: "done", taskId: "t1" }), entry({ key: "outra", taskId: "t2" })];
    expect(supersededKeys(list, "t1")).toEqual(["done"]);
  });

  it("never replaces something the server already refused", () => {
    // Ali existe a decisão de outra pessoa esperando ser vista.
    const list = [entry({ key: "recusada", taskId: "t1", state: "conflict" })];
    expect(supersededKeys(list, "t1")).toEqual([]);
  });
});

describe("visibleForOwner", () => {
  it("shows only what this account decided", () => {
    // O IndexedDB é da origem: num tablet de casa, a fila de quem saiu não pode
    // subir com a sessão de quem entrou.
    const list = [entry({ key: "minha" }), entry({ key: "de-outro", userId: "u2" })];
    expect(visibleForOwner(list, "u1").map((item) => item.key)).toEqual(["minha"]);
  });

  it("forgets what is older than the server keeps a receipt for", () => {
    const old = entry({ key: "velha", createdAt: Date.now() - MAX_QUEUE_AGE_MS - 1 });
    expect(visibleForOwner([old], "u1")).toEqual([]);
    expect(expiredKeys([old])).toEqual(["velha"]);
  });
});
