import assert from "node:assert/strict";
import { test } from "node:test";
import { chatRecap, chatSchema, turnChanges } from "../src/shared/assistantChat.ts";
import type { Project } from "../src/shared/types.ts";

const base: Project = {
  version: 1,
  id: "p",
  name: "Aula",
  createdAt: 0,
  updatedAt: 0,
  settings: { width: 1920, height: 1080, fps: 30 },
  assets: [
    {
      id: "tela",
      name: "Tela",
      path: "C:/tela.mp4",
      kind: "video",
      duration: 60,
      width: 1920,
      height: 1080,
      fps: 30,
      hasVideo: true,
      hasAudio: true,
      size: 1,
      proxyStatus: "none",
    },
  ],
  tracks: [{ id: "t", kind: "video", name: "Tela", muted: false, hidden: false, locked: false }],
  clips: [{ id: "c", assetId: "tela", trackId: "t", start: 0, in: 0, duration: 60, volume: 1 }],
};

test("turnChanges lists what a turn changed, as the review bar reads it", () => {
  assert.deepEqual(turnChanges(base, base), []);
  const after: Project = {
    ...base,
    palette: "sistema-zero",
    clips: [{ ...base.clips[0], transform: { x: 0.4, y: 0.5, scale: 0.8, opacity: 1 } }],
  };
  const changes = turnChanges(base, after);
  assert.ok(changes.length >= 2, JSON.stringify(changes));
  assert.ok(changes.every((c) => c.label && c.id));
});

test("the panel's conversation is kept in a checked shape and recapped for a new session", () => {
  const chat = {
    version: 1 as const,
    items: [
      { id: 1, role: "user" as const, text: "Limpe a aula", tools: [] },
      {
        id: 2,
        role: "assistant" as const,
        text: "Propus 12 cortes.",
        tools: [
          { id: "t1", name: "apply_cleanup", title: "Limpeza automática", status: "done" as const },
        ],
        usage: { tokens: 1200, usd: 0.01 },
        changes: [{ id: "x", kind: "zoom", label: "Zoom em Tela", at: 4 }],
      },
      { id: 3, role: "error" as const, text: "Falhou", tools: [] },
    ],
  };
  assert.ok(chatSchema.safeParse(chat).success);
  assert.equal(chatSchema.safeParse({ ...chat, version: 2 }).success, false);
  const recap = chatRecap(chat.items);
  assert.match(recap, /Pessoa: Limpe a aula/);
  assert.match(recap, /Assistente \(usou Limpeza automática\): Propus 12 cortes\./);
  assert.doesNotMatch(recap, /Falhou/);
  // Only the newest lines fit.
  const long = Array.from({ length: 200 }, (_, i) => ({
    id: i,
    role: "user" as const,
    text: `pedido ${i} ${"x".repeat(80)}`,
    tools: [],
  }));
  const short = chatRecap(long, 1000);
  assert.ok(short.length <= 1000);
  assert.match(short, /pedido 199/);
});

test("a kept conversation masks what looks like a key and keeps the newest items that fit", async () => {
  const { fitChat, maskChat, maskSecrets } = await import("../src/shared/assistantChat.ts");
  assert.equal(
    maskSecrets(
      "minha chave é sk-ant-api03-abcdefghijklmnop e o token Bearer abcdefghijklmnopqrstuvwxyz",
    ),
    "minha chave é [segredo omitido] e o token [segredo omitido]",
  );
  assert.equal(maskSecrets("corte a frase do intervalo"), "corte a frase do intervalo");
  const items = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    role: "user" as const,
    text: `pedido ${i} ${"y".repeat(200)}`,
    tools: [],
  }));
  const fit = fitChat({ version: 1, items }, 3000);
  assert.ok(JSON.stringify(fit).length <= 3000);
  assert.equal(fit.items.at(-1)?.id, 49);
  const masked = maskChat({
    version: 1,
    items: [{ id: 1, role: "user", text: "sk-ant-api03-zzzzzzzzzzzzzzzz", tools: [] }],
  });
  assert.equal(masked.items[0].text, "[segredo omitido]");
});

test("what a turn changed leaves out the person's edits made in the middle of it", async () => {
  const { turnChangesFrom } = await import("../src/shared/assistantChat.ts");
  const ai = { origin: "ai" as const, turn: "t1" };
  const person = { origin: "user" as const };
  const s1: Project = { ...base, palette: "sistema-zero" };
  const s2: Project = { ...s1, name: "Renomeada pela pessoa" };
  const s3: Project = {
    ...s2,
    clips: [{ ...base.clips[0], transform: { x: 0.4, y: 0.5, scale: 0.8, opacity: 1 } }],
  };
  // base -(AI)-> s1 -(person)-> s2 -(AI)-> s3
  const changes = turnChangesFrom({ past: [base, s1, s2], pastMeta: [ai, person, ai] }, s3, "t1");
  assert.ok(changes.length >= 2);
  assert.ok(!changes.some((c) => /Renomeada/.test(c.label)), JSON.stringify(changes));
  assert.deepEqual(turnChangesFrom({ past: [base], pastMeta: [person] }, s1, "t1"), []);
});
