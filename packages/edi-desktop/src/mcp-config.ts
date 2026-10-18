import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { lock } from "proper-lockfile";
import { type AST, getStaticTOMLValue, parseTOML } from "toml-eslint-parser";
import { z } from "zod";
import { createClientGrant, grantForBearer, revokeClientGrants, revokeGrant } from "./access";

function index(source: string) {
  const tree = parseTOML(source, { tomlVersion: "1.0" });
  const entries: { path: string[]; node: AST.TOMLKeyValue }[] = [];
  const tables: AST.TOMLTable[] = [];
  function pair(node: AST.TOMLKeyValue, prefix: string[]) {
    const path = [...prefix, ...getStaticTOMLValue(node.key)];
    entries.push({ path, node });
    if (node.value.type === "TOMLInlineTable")
      for (const child of node.value.body) pair(child, path);
  }
  for (const node of tree.body[0].body) {
    if (node.type === "TOMLTable") {
      tables.push(node);
      for (const child of node.body) pair(child, node.resolvedKey.map(String));
    } else pair(node, []);
  }
  return { entries, tables };
}
const equal = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, i) => item === right[i]);
const prefix = (left: string[], right: string[]) =>
  left.length < right.length && left.every((item, i) => item === right[i]);
function remove(source: string, path: string[]) {
  const entry = index(source).entries.find((item) => equal(item.path, path));
  if (!entry) return source;
  let [start, end] = entry.node.range;
  if (entry.node.parent.type === "TOMLInlineTable") {
    const siblings = entry.node.parent.body;
    const position = siblings.indexOf(entry.node);
    const next = siblings[position + 1];
    const previous = siblings[position - 1];
    if (next) end = next.range[0];
    else if (previous) start = previous.range[1];
  }
  return source.slice(0, start) + source.slice(end);
}
function upsert(source: string, path: string[], value: string): string {
  const parsed = index(source);
  const entry = parsed.entries.find((item) => equal(item.path, path));
  if (entry)
    return (
      source.slice(0, entry.node.value.range[0]) +
      JSON.stringify(value) +
      source.slice(entry.node.value.range[1])
    );
  const inline = parsed.entries
    .filter((item) => item.node.value.type === "TOMLInlineTable" && prefix(item.path, path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (inline && inline.node.value.type === "TOMLInlineTable") {
    const container = inline.node.value;
    const position = container.range[1] - 1;
    const assignment = `${path
      .slice(inline.path.length)
      .map((part) => JSON.stringify(part))
      .join(".")} = ${JSON.stringify(value)}`;
    return (
      source.slice(0, position) +
      `${container.body.length ? ", " : ""}${assignment}` +
      source.slice(position)
    );
  }
  const table = parsed.tables
    .filter((item) => item.kind === "standard" && prefix(item.resolvedKey.map(String), path))
    .sort((a, b) => b.resolvedKey.length - a.resolvedKey.length)[0];
  if (table) {
    const lineEnd = source.indexOf("\n", table.key.range[1]);
    const assignment = `${path
      .slice(table.resolvedKey.length)
      .map((part) => JSON.stringify(part))
      .join(".")} = ${JSON.stringify(value)}\n`;
    return lineEnd < 0
      ? `${source}\n${assignment}`
      : source.slice(0, lineEnd + 1) + assignment + source.slice(lineEnd + 1);
  }
  // No matching table: a new, independent Edi section leaves every existing byte intact.
  const server = path.slice(0, 2);
  return `${source}${source.endsWith("\n") || !source ? "" : "\n"}\n[${server.map((part) => JSON.stringify(part)).join(".")}]\n${path
    .slice(2)
    .map((part) => JSON.stringify(part))
    .join(".")} = ${JSON.stringify(value)}\n`;
}
export function codexMcpConfiguration(
  source: string,
  name: string,
  url: string,
  authorization: string,
): string {
  const base = ["mcp_servers", z.enum(["ediaula", "edifoto", "edisvg"]).parse(name)];
  let next = remove(source, [...base, "bearer_token_env_var"]);
  next = remove(next, [...base, "http_headers_helper"]);
  next = remove(next, [...base, "env_http_headers", "Authorization"]);
  next = upsert(next, [...base, "url"], url);
  next = upsert(next, [...base, "http_headers", "Authorization"], authorization);
  parseTOML(next, { tomlVersion: "1.0" });
  return next;
}
async function existing(path: string): Promise<string | null> {
  try {
    const result = await readFile(path, "utf8");
    if (Buffer.byteLength(result) > 2 * 1024 ** 2)
      throw new Error("Client configuration exceeds limit");
    return result;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
type ClientConfig = {
  client: "claude-code" | "codex";
  home: string;
  name: string;
  port: number;
  /** Replace the client's token even when the one configured still works (Reconectar). */
  rotate?: boolean;
};

const configPath = (config: Pick<ClientConfig, "client" | "home">): string =>
  config.client === "codex"
    ? join(config.home, ".codex", "config.toml")
    : join(config.home, ".claude.json");

/** The Authorization header configured for the tool's server in the client, if any. */
async function configuredAuthorization(config: ClientConfig): Promise<string | null> {
  const source = await existing(configPath(config));
  if (source === null) return null;
  const rootSchema = z.object({
    mcp_servers: z.record(z.string(), z.unknown()).optional(),
    mcpServers: z.record(z.string(), z.unknown()).optional(),
  });
  const parsed = rootSchema.parse(
    config.client === "codex" ? getStaticTOMLValue(parseTOML(source)) : JSON.parse(source),
  );
  const server = z
    .object({
      url: z.string(),
      headers: z.record(z.string(), z.string()).optional(),
      http_headers: z.record(z.string(), z.string()).optional(),
    })
    .safeParse((config.client === "codex" ? parsed.mcp_servers : parsed.mcpServers)?.[config.name]);
  if (!server.success || server.data.url !== `http://127.0.0.1:${config.port}/mcp`) return null;
  return (
    (config.client === "codex" ? server.data.http_headers : server.data.headers)?.Authorization ??
    null
  );
}

/**
 * Called only by an explicit Connect client action. Other servers and comments are preserved.
 * The client gets a token of its own that can read and propose; writes ask for approval in the
 * tool. A client already configured with a valid token of its own is left as it is: a client
 * that is open (Claude Code) may write its old copy of the file back, so the token only changes
 * on an explicit Reconectar (`rotate`) or after a revocation. The token ends 30 days after its
 * last use (access.ts CLIENT_GRANT_TTL_MS); the client then shows as not connected. Connecting
 * also ends the token of an earlier version. Returns whether the configuration was written.
 */
export async function configureMcpClient(config: ClientConfig): Promise<boolean> {
  const name = z.enum(["ediaula", "edifoto", "edisvg"]).parse(config.name);
  const port = z.int().min(1024).max(65535).parse(config.port);
  const target = configPath(config);
  const url = `http://127.0.0.1:${port}/mcp`;
  if (!config.rotate) {
    const current = await configuredAuthorization({ ...config, name, port });
    const grant = current ? grantForBearer(current) : null;
    if (grant && grant.client === config.client) {
      await revokeClientGrants("legacy");
      return false;
    }
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const { token, grant } = await createClientGrant({
    client: config.client,
    scopes: ["read", "propose"],
  });
  const authorization = `Bearer ${token}`;
  let written = false;
  try {
    await writeClientConfiguration(config.client, target, name, url, authorization);
    written = true;
  } finally {
    if (!written) await revokeGrant(grant.id);
  }
  await revokeClientGrants(config.client, grant.id);
  await revokeClientGrants("legacy");
  return true;
}
async function writeClientConfiguration(
  client: "claude-code" | "codex",
  target: string,
  name: string,
  url: string,
  authorization: string,
) {
  const release = await lock(target, { realpath: false, stale: 30000, retries: 0 });
  let temporary: string | undefined;
  try {
    const before = await existing(target);
    let after: string;
    if (client === "codex") after = codexMcpConfiguration(before ?? "", name, url, authorization);
    else {
      const root = z.record(z.string(), z.unknown()).parse(JSON.parse(before ?? "{}"));
      const servers = z.record(z.string(), z.unknown()).parse(root.mcpServers ?? {});
      const server = z.record(z.string(), z.unknown()).parse(servers[name] ?? {});
      root.mcpServers = {
        ...servers,
        [name]: { ...server, type: "http", url, headers: { Authorization: authorization } },
      };
      after = `${JSON.stringify(root, null, 2)}\n`;
    }
    if (before === after) return;
    if ((await existing(target)) !== before)
      throw new Error("Client configuration changed during connection; no changes were saved");
    if (before !== null) await copyFile(target, `${target}.edi-backup-${randomUUID()}`);
    temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(after, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    temporary = undefined;
  } finally {
    try {
      if (temporary) await unlink(temporary);
    } finally {
      await release();
    }
  }
}
export async function connectMcpClient(
  config: ClientConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const written = await configureMcpClient(config);
    return {
      ok: true,
      message: written
        ? "Conectado com autenticação local. Feche e abra o cliente de novo para ele usar o acesso novo. Uma cópia da configuração anterior foi preservada."
        : "Este cliente já está conectado. Para trocar o acesso dele, use Reconectar e depois feche e abra o cliente.",
    };
  } catch (error) {
    console.error(
      "[edi] client_configuration_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return {
      ok: false,
      message:
        "Não foi possível atualizar a configuração do cliente. O arquivo anterior permanece preservado; verifique se outro processo está alterando a configuração.",
    };
  }
}
export async function isMcpClientConnected(config: ClientConfig): Promise<boolean> {
  try {
    const authorization = await configuredAuthorization(config);
    const grant = authorization ? grantForBearer(authorization) : null;
    return !!grant && (grant.client === config.client || grant.client === "legacy");
  } catch (error) {
    console.error(
      "[edi] client_configuration_invalid",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  }
}
