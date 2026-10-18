import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ApprovalAnswer,
  type ApprovalQuestion,
  type CallMeta,
  CHECK_CLIENT,
  type GuardDeps,
  guarded,
  PANEL_CLIENT,
  PROJECT_APPROVAL_MS,
} from "../src/main/mcpGuard.ts";
import type { AiToolName } from "../src/shared/aiTools.ts";

type Scope = "read" | "propose" | "write";

let grantSeq = 0;
const grant = (scopes: Scope[], client = "claude-code", projectId?: string) => ({
  id: `g${++grantSeq}`,
  client,
  scopes,
  ...(projectId ? { projectId } : {}),
});

/** Fake dependencies: answers approvals as told and records what reached the editor. */
function deps(answers: ApprovalAnswer[], clock = { now: 1_000_000 }) {
  const asked: ApprovalQuestion[] = [];
  const calls: { name: AiToolName; meta: CallMeta }[] = [];
  const d: GuardDeps = {
    approve: async (question) => {
      asked.push(question);
      return answers.shift() ?? { choice: "deny", projectId: null };
    },
    call: async (name, _args, meta) => {
      calls.push({ name, meta });
      return { ok: true, text: "feito" };
    },
    now: () => clock.now,
  };
  return { d, asked, calls, clock };
}

test("a client that reads and proposes runs those tools without asking", async () => {
  const g = grant(["read", "propose"]);
  const { d, asked, calls } = deps([]);
  assert.equal((await guarded(g, "get_overview", {}, d)).ok, true);
  assert.equal((await guarded(g, "propose_cuts", { title: "x", items: [] }, d)).ok, true);
  assert.equal(asked.length, 0);
  assert.deepEqual(
    calls.map((c) => [c.name, c.meta.source, c.meta.client]),
    [
      ["get_overview", "mcp", g.id],
      ["propose_cuts", "mcp", g.id],
    ],
  );
});

test("a write asks the person, with every argument, and a denial reaches nothing", async () => {
  const g = grant(["read", "propose"]);
  const { d, asked, calls } = deps([{ choice: "deny", projectId: "p1" }]);
  const args = { quotes: [{ text: "a".repeat(400) }] };
  const r = await guarded(g, "cut_text", args, d);
  assert.equal(r.ok, false);
  assert.match(r.text, /não autorizou/);
  assert.equal(calls.length, 0);
  assert.equal(asked[0].tool, "cut_text");
  assert.equal(asked[0].client, "Claude Code");
  assert.ok(asked[0].details.includes("a".repeat(400)), "the dialog gets the full arguments");
});

test("an approval binds the call to the project open when the person answered", async () => {
  const g = grant(["read", "propose"]);
  const { d, calls } = deps([{ choice: "once", projectId: "p1" }]);
  await guarded(g, "cut_text", { quotes: [{ text: "x" }] }, d);
  assert.equal(calls[0].meta.projectId, "p1");
  // "Uma vez" is once: the next write asks again (and is denied here).
  assert.equal((await guarded(g, "cut_text", { quotes: [{ text: "y" }] }, d)).ok, false);
});

test("15 minutes for the project skip the question, except for switching lessons or importing", async () => {
  const g = grant(["read", "propose"]);
  const { d, asked, calls, clock } = deps([{ choice: "project", projectId: "p1" }]);
  await guarded(g, "cut_text", { quotes: [{ text: "x" }] }, d);
  await guarded(g, "set_motion", { clip_ids: ["c"] }, d);
  assert.equal(asked.length, 1);
  assert.equal(calls[1].meta.projectId, "p1");
  for (const name of ["open_project", "create_project", "import_media"] as const) {
    const before = asked.length;
    await guarded(g, name, {}, d);
    assert.equal(asked.length, before + 1, `${name} always asks`);
  }
  clock.now += PROJECT_APPROVAL_MS + 1;
  const before = asked.length;
  await guarded(g, "set_motion", { clip_ids: ["c"] }, d);
  assert.equal(asked.length, before + 1, "the approval ended");
});

test("the chat's own runs write without asking, tied to their project; the self-check never asks", async () => {
  const panel = grant(["read", "propose", "write"], PANEL_CLIENT, "p9");
  const { d, asked, calls } = deps([]);
  await guarded(panel, "cut_text", { quotes: [{ text: "x" }] }, d);
  assert.deepEqual([calls[0].meta.source, calls[0].meta.projectId], ["assistant", "p9"]);
  const check = grant(["read"], CHECK_CLIENT);
  assert.equal((await guarded(check, "cut_text", {}, d)).ok, false);
  assert.equal((await guarded(check, "propose_cuts", {}, d)).ok, false);
  assert.equal(asked.length, 0);
});
