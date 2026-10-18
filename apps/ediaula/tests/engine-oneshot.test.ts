import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claudeOneShotArgs,
  claudeOneShotResult,
  codexOneShotArgs,
  messageDelta,
} from "../src/main/engineArgs.ts";
import { chatRecap, chatSchema, turnChanges } from "../src/shared/assistantChat.ts";
import type { Project } from "../src/shared/types.ts";

test("messageDelta streams only what is new of a Codex message", () => {
  const shown = new Map<string, string>();
  assert.equal(messageDelta(shown, "m1", "Olá"), "Olá");
  assert.equal(messageDelta(shown, "m1", "Olá, cortei"), ", cortei");
  // The whole text at the end adds only the rest.
  assert.equal(messageDelta(shown, "m1", "Olá, cortei 3 trechos."), " 3 trechos.");
  assert.equal(messageDelta(shown, "m1", "Olá, cortei 3 trechos."), "");
  // A shorter version never takes back what was shown.
  assert.equal(messageDelta(shown, "m1", "Olá"), "");
  // A text that changed earlier on adds what comes after what was shown.
  assert.equal(messageDelta(shown, "m1", "Oi!, cortei 3 trechos. Pronto"), " Pronto");
  // Each message on its own.
  assert.equal(messageDelta(shown, "m2", "Outra"), "Outra");
});

test("one-shot runs have no tools at all and send the prompt on standard input", () => {
  const claude = claudeOneShotArgs({ model: "claude-opus-5-5", effort: "low" });
  assert.deepEqual(claude.slice(0, 5), ["-p", "--input-format", "text", "--output-format", "json"]);
  assert.equal(claude[claude.indexOf("--tools") + 1], "");
  assert.ok(claude.includes("--strict-mcp-config"));
  assert.equal(claude[claude.indexOf("--mcp-config") + 1], '{"mcpServers":{}}');
  assert.ok(!claude.some((a) => /ediaula/.test(a)));
  assert.equal(claudeOneShotArgs({ model: "default" }).includes("--model"), false);
  const codex = codexOneShotArgs({ workspace: "C:\\ws", disabledFeatures: ["shell_tool"] });
  assert.equal(codex.at(-1), "-");
  assert.ok(codex.includes("read-only") && codex.includes("--ignore-user-config"));
  assert.ok(!codex.some((a) => /mcp_servers/.test(a)));
  assert.ok(codex.includes("features.shell_tool=false"));
});

test("claudeOneShotResult reads the answer, and its failures", () => {
  assert.equal(
    claudeOneShotResult(
      'aviso qualquer\n{"type":"result","is_error":false,"result":"{\\"cues\\":[]}"}\n',
    ),
    '{"cues":[]}',
  );
  assert.throws(
    () => claudeOneShotResult('{"type":"result","is_error":true,"result":"Not logged in"}'),
    /Claude Code: Not logged in/,
  );
  assert.throws(() => claudeOneShotResult(""), /não devolveu resposta/);
});

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
