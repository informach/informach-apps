import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  configureDesktopAccess,
  createClientGrant,
  type McpScope,
  mintRunToken,
} from "./access.ts";
import { PANEL_CLIENT } from "./ai-grants.ts";
import { createToolGuard, describeArguments, type GuardDeps } from "./mcp-guard.ts";
import { startLocalMcpServer } from "./mcp-server.ts";

const TOOLS = {
  read_doc: { title: "Ler", description: "Lê o documento.", input: z.object({}) },
  edit: {
    title: "Editar",
    description: "Muda o documento.",
    input: z.strictObject({ value: z.number().min(0).max(10) }),
  },
  open_file: {
    description: "Abre outro arquivo.",
    input: z.strictObject({ path: z.string() }),
  },
} as const;
type Tool = keyof typeof TOOLS;
const PERMISSION: Record<Tool, McpScope> = { read_doc: "read", edit: "write", open_file: "write" };

let licensed = true;
let ran: { name: Tool; args: unknown; source: string }[] = [];
let asked: string[] = [];
let server: Awaited<ReturnType<typeof startLocalMcpServer<Tool>>>;
let url = "";

beforeEach(async () => {
  licensed = true;
  ran = [];
  asked = [];
  configureDesktopAccess({
    token: "a".repeat(64),
    assertAccess: () => {
      if (!licensed) throw new Error("Access revoked");
    },
  });
  const guard = createToolGuard<Tool>({
    appName: "EdiTeste",
    permission: (name) => PERMISSION[name],
    title: (name) => TOOLS[name].description,
    describe: (name, args) => describeArguments(name, args),
  });
  const deps: GuardDeps<Tool> = {
    approve: async (question) => {
      asked.push(question.tool);
      return { choice: "deny", projectId: null };
    },
    call: async (name, args, meta) => {
      ran.push({ name, args, source: meta.source });
      return {
        ok: true,
        text: `feito ${name}`,
        ...(name === "read_doc"
          ? { images: [{ mime: "image/png" as const, data: "iVBORw0KGgo=" }] }
          : {}),
      };
    },
  };
  server = await startLocalMcpServer<Tool>({
    port: 0,
    name: "editeste",
    version: "1.0.0",
    instructions: "Comece por read_doc.",
    tools: TOOLS,
    offered: (grant, name) => !(grant.client === PANEL_CLIENT && name === "open_file"),
    call: (grant, name, args) => guard.guarded(grant, name, args, deps),
    bodyLimit: 4096,
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const headers = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
});

async function rpc(
  token: string,
  method: string,
  params: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  return z.object({ result: z.record(z.string(), z.unknown()) }).parse(body).result;
}

const toolNames = async (token: string): Promise<string[]> =>
  z
    .array(z.object({ name: z.string() }))
    .parse((await rpc(token, "tools/list", {})).tools)
    .map((tool) => tool.name);

describe("the local MCP server", () => {
  it("refuses web pages, foreign hosts, missing tokens, other paths and other methods", async () => {
    const app = "a".repeat(64);
    const body = "{}";
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers(app), Origin: "https://x.y" },
          body,
        })
      ).status,
    ).toBe(403);
    expect((await fetch(url, { method: "POST", body })).status).toBe(403);
    expect(
      (await fetch(url, { method: "POST", headers: headers("b".repeat(64)), body })).status,
    ).toBe(403);
    expect((await fetch(`${url}/x`, { method: "POST", headers: headers(app), body })).status).toBe(
      404,
    );
    expect((await fetch(url, { method: "GET", headers: headers(app) })).status).toBe(405);
    const big = await fetch(url, {
      method: "POST",
      headers: headers(app),
      body: JSON.stringify({ padding: "x".repeat(5000) }),
    });
    expect(big.status).toBe(413);
    licensed = false;
    expect((await fetch(url, { method: "POST", headers: headers(app), body })).status).toBe(403);
  });

  it("checks the input before a tool runs, and returns text and pictures", async () => {
    const app = "a".repeat(64);
    expect(await toolNames(app)).toEqual(["read_doc", "edit", "open_file"]);
    const bad = await rpc(app, "tools/call", { name: "edit", arguments: { value: 99 } });
    expect(bad.isError).toBe(true);
    expect(ran).toHaveLength(0);
    const read = await rpc(app, "tools/call", { name: "read_doc", arguments: {} });
    expect(read.isError).toBe(false);
    expect(read.content).toEqual([
      { type: "text", text: "feito read_doc" },
      { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
    ]);
  });

  it("applies each grant's scopes: a connected client asks before writing", async () => {
    const { token } = await createClientGrant({
      client: "claude-code",
      scopes: ["read", "propose"],
    });
    expect((await rpc(token, "tools/call", { name: "read_doc", arguments: {} })).isError).toBe(
      false,
    );
    const write = await rpc(token, "tools/call", { name: "edit", arguments: { value: 1 } });
    expect(write.isError).toBe(true);
    expect(asked).toEqual(["edit"]);
    expect(ran.map((r) => r.name)).toEqual(["read_doc"]);
  });

  it("serves a run token only while the run lasts, with the panel's own tool list", async () => {
    const run = mintRunToken({
      scopes: ["read", "propose", "write"],
      ttlMs: 60_000,
      projectId: "p1",
      client: PANEL_CLIENT,
    });
    expect(await toolNames(run.token)).toEqual(["read_doc", "edit"]);
    const write = await rpc(run.token, "tools/call", { name: "edit", arguments: { value: 2 } });
    expect(write.isError).toBe(false);
    expect(ran).toEqual([{ name: "edit", args: { value: 2 }, source: "assistant" }]);
    expect(asked).toHaveLength(0);
    run.revoke();
    expect(
      (await fetch(url, { method: "POST", headers: headers(run.token), body: "{}" })).status,
    ).toBe(403);
  });
});
