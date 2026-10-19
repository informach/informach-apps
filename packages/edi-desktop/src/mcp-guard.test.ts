import { describe, expect, it } from "vitest";
import type { McpScope } from "./access.ts";
import { CHECK_CLIENT, PANEL_CLIENT } from "./ai-grants.ts";
import {
  type ApprovalAnswer,
  type ApprovalQuestion,
  type CallMeta,
  createToolGuard,
  describeArguments,
  type GuardDeps,
  PROJECT_APPROVAL_MS,
} from "./mcp-guard.ts";

type Tool = "read_doc" | "propose_edit" | "edit" | "open_file";

const PERMISSION: Record<Tool, McpScope> = {
  read_doc: "read",
  propose_edit: "propose",
  edit: "write",
  open_file: "write",
};

const newGuard = () =>
  createToolGuard<Tool>({
    appName: "EdiTeste",
    permission: (name) => PERMISSION[name],
    title: (name) => `Título de ${name}`,
    describe: (name, args) => describeArguments(`Título de ${name}`, args),
    alwaysAsk: (name) => name === "open_file",
    clientNames: { "claude-restrito": "Claude Code só com o EdiTeste" },
  });

let seq = 0;
const grant = (scopes: McpScope[], client = "claude-code", projectId?: string) => ({
  id: `g${++seq}`,
  client,
  scopes,
  ...(projectId ? { projectId } : {}),
});

/** Answers questions as told and records what reached the editor. */
function deps(answers: ApprovalAnswer[], clock = { now: 1_000_000 }, live = () => true) {
  const asked: ApprovalQuestion[] = [];
  const calls: { name: Tool; meta: CallMeta; allowed: () => boolean }[] = [];
  const d: GuardDeps<Tool> = {
    approve: async (question) => {
      asked.push(question);
      return answers.shift() ?? { choice: "deny", projectId: null };
    },
    call: async (name, _args, meta, allowed) => {
      calls.push({ name, meta, allowed });
      return { ok: true, text: "feito" };
    },
    live: () => live(),
    now: () => clock.now,
  };
  return { d, asked, calls, clock };
}

describe("the per-tool guard", () => {
  it("runs reads and proposals a grant covers, without asking", async () => {
    const { guarded } = newGuard();
    const g = grant(["read", "propose"]);
    const { d, asked, calls } = deps([]);
    expect((await guarded(g, "read_doc", {}, d)).ok).toBe(true);
    expect((await guarded(g, "propose_edit", {}, d)).ok).toBe(true);
    expect(asked).toHaveLength(0);
    expect(calls.map((c) => [c.name, c.meta.source, c.meta.client])).toEqual([
      ["read_doc", "mcp", g.id],
      ["propose_edit", "mcp", g.id],
    ]);
  });

  it("asks before a write, with every argument, and a denial reaches nothing", async () => {
    const { guarded } = newGuard();
    const g = grant(["read", "propose"]);
    const { d, asked, calls } = deps([{ choice: "deny", projectId: "p1" }]);
    const args = { text: "a".repeat(400) };
    const r = await guarded(g, "edit", args, d);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/não autorizou.*no EdiTeste/);
    expect(calls).toHaveLength(0);
    expect(asked[0]?.client).toBe("Claude Code");
    expect(asked[0]?.summary.length).toBeLessThan(300);
    expect(asked[0]?.details, "the question gets the full arguments").toContain("a".repeat(400));
  });

  it("binds an approval to the project open at the answer; 'project' lasts its time", async () => {
    const { guarded } = newGuard();
    const g = grant(["read", "propose"]);
    const { d, asked, calls, clock } = deps([
      { choice: "once", projectId: "p0" },
      { choice: "project", projectId: "p1" },
    ]);
    await guarded(g, "edit", {}, d);
    expect(calls[0]?.meta.projectId).toBe("p0");
    await guarded(g, "edit", {}, d);
    await guarded(g, "edit", {}, d);
    expect(asked, "'uma vez' is once, 'projeto' covers the next").toHaveLength(2);
    expect(calls[2]?.meta.projectId).toBe("p1");
    const before = asked.length;
    await guarded(g, "open_file", {}, d);
    expect(asked.length, "always asked, even during an approval").toBe(before + 1);
    clock.now += PROJECT_APPROVAL_MS + 1;
    await guarded(g, "edit", {}, d);
    expect(asked.length, "the approval ended").toBe(before + 2);
  });

  it("lets the panel's runs write without asking, tied to their project; the check never asks", async () => {
    const { guarded } = newGuard();
    const panel = grant(["read", "propose", "write"], PANEL_CLIENT, "p9");
    const { d, asked, calls } = deps([]);
    await guarded(panel, "edit", {}, d);
    await guarded(panel, "open_file", {}, d);
    expect(calls.map((c) => [c.meta.source, c.meta.projectId])).toEqual([
      ["assistant", "p9"],
      ["assistant", "p9"],
    ]);
    const check = grant(["read"], CHECK_CLIENT);
    expect((await guarded(check, "edit", {}, d)).ok).toBe(false);
    expect((await guarded(check, "propose_edit", {}, d)).ok).toBe(false);
    expect(asked).toHaveLength(0);
    // A client with the write scope still asks for the tools always asked.
    const restricted = grant(["read", "propose", "write"], "claude-restrito");
    await guarded(restricted, "open_file", {}, d);
    expect(asked[0]?.client).toBe("Claude Code só com o EdiTeste");
  });

  it("refuses a call whose grant ended, before and after the question", async () => {
    const { guarded } = newGuard();
    let alive = false;
    const g = grant(["read", "propose"]);
    const { d, calls } = deps([], undefined, () => alive);
    expect((await guarded(g, "read_doc", {}, d)).text).toMatch(/Este acesso terminou/);
    alive = true;
    const late: GuardDeps<Tool> = {
      ...d,
      approve: async () => {
        alive = false;
        return { choice: "once", projectId: "p1" };
      },
    };
    expect((await guarded(g, "edit", {}, late)).ok).toBe(false);
    expect(calls).toHaveLength(0);
    alive = true;
    await guarded(g, "read_doc", {}, d);
    expect(calls[0]?.allowed()).toBe(true);
    alive = false;
    expect(calls[0]?.allowed(), "the check goes with the call, for the editor's queue").toBe(false);
  });

  it("keeps approvals per application", async () => {
    const one = newGuard();
    const two = newGuard();
    one.approveForProject("g", "p1", 0);
    expect(one.approvedProject("g", 10)).toBe("p1");
    expect(two.approvedProject("g", 10)).toBeNull();
  });
});
