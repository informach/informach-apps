import { lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { MEMORY_TYPES, type MemoryType } from "../shared/aiTools.ts";

/**
 * The panel assistant's memory: durable preferences the person asked it to keep ("ao exportar,
 * só o MP4"), one Markdown file per memory plus the index MEMORY.md, in a folder of EdiAula's
 * own. The assistant only reaches it through remember, forget and list_memories (never a file
 * tool), and every turn of the panel reads it back (memoryPrompt), so what it writes is what it
 * reads. Nothing here leaves the folder: names are checked, links are refused, and each file is
 * replaced whole (written beside it, then renamed).
 */

export const MEMORY_INDEX = "MEMORY.md";
/** Largest memory file, frontmatter included. */
export const MEMORY_MAX_BYTES = 8 * 1024;
/** Most memories kept: past this, forget one first. */
export const MEMORY_MAX_COUNT = 100;
/**
 * Most of the system prompt the memories take, whole or as index lines. Claude Code receives it
 * on the command line, which Windows caps at 32,767 characters with the editor's guide in it.
 */
export const PROMPT_MAX_BYTES = 12 * 1024;
/** Longest description an index line of the prompt carries. */
const PROMPT_DESCRIPTION_MAX = 160;

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const FILE = /^(user|feedback|project|reference)_([a-z0-9]+(?:_[a-z0-9]+)*)\.md$/;

export interface Memory {
  name: string;
  description: string;
  type: MemoryType;
  body: string;
  file: string;
}

export interface RememberInput {
  name: string;
  description: string;
  type: MemoryType;
  body: string;
  title?: string;
}

export class MemoryError extends Error {}

/** The file of a memory: `<type>_<name with _>.md`. */
export const memoryFile = (type: MemoryType, name: string): string =>
  `${type}_${name.replaceAll("-", "_")}.md`;

function checkName(name: string): void {
  if (name.length > NAME_MAX || !NAME.test(name))
    throw new MemoryError(
      `Nome recusado: "${name}". Use só letras minúsculas, números e hífens, até ${NAME_MAX} caracteres (ex.: exportar-so-mp4). A memória fica sempre na pasta de memória do EdiAula; caminhos e "../" não são aceitos.`,
    );
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** A YAML scalar: plain when safe, double-quoted (JSON is valid YAML) otherwise. */
const yamlValue = (text: string): string =>
  /^[\p{L}\p{N}][\p{L}\p{N} .,;()/+-]*$/u.test(text) ? text : JSON.stringify(text);

function readYamlValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Not ours: kept as written.
    }
  }
  return value;
}

export function renderMemory(memory: Omit<Memory, "file">): string {
  return `---\nname: ${memory.name}\ndescription: ${yamlValue(memory.description)}\nmetadata:\n  type: ${memory.type}\n---\n\n${memory.body.trim()}\n`;
}

/** A memory file, or null when it is not one (no frontmatter, unknown type). */
export function parseMemory(file: string, text: string): Memory | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return null;
  const [, head = "", body = ""] = match;
  const fields = new Map<string, string>();
  for (const line of head.split(/\r?\n/)) {
    const field = /^\s*(name|description|type):\s*(.*)$/.exec(line);
    if (field?.[1] && !fields.has(field[1])) fields.set(field[1], readYamlValue(field[2] ?? ""));
  }
  // The name the tools take: a hand-edited one they would refuse ("Exportar MP4") gives way to
  // the file's, so the memory can still be updated and forgotten from the chat.
  const written = fields.get("name") ?? "";
  const fromFile = FILE.exec(file)?.[2]?.replaceAll("_", "-");
  const name = written.length <= NAME_MAX && NAME.test(written) ? written : (fromFile ?? written);
  const type = fields.get("type") ?? FILE.exec(file)?.[1] ?? "";
  if (!name || !(MEMORY_TYPES as readonly string[]).includes(type)) return null;
  return {
    name,
    description: fields.get("description") ?? "",
    type: type as MemoryType,
    body: body.trim(),
    file,
  };
}

/** The file an index line points at (`- [Título](arquivo.md) — gancho`), or null. */
const entryFile = (line: string): string | null =>
  /^\s*-\s*\[[^\]]*\]\(([^)\s]+)\)/.exec(line)?.[1] ?? null;

/**
 * The index with one line for `file`: the first line pointing at it (or at a file the memory
 * had before, `previous`) is replaced in place, other lines for them go, and a new memory goes
 * at the end. Lines the index has for other memories, and any text of its own, stay.
 */
export function upsertIndexLine(
  index: string,
  file: string,
  line: string,
  previous: readonly string[] = [],
): string {
  const targets = new Set([file, ...previous]);
  const out: string[] = [];
  let placed = false;
  for (const current of index ? index.replace(/\r?\n$/, "").split(/\r?\n/) : []) {
    const points = entryFile(current);
    if (points && targets.has(points)) {
      if (!placed) out.push(line);
      placed = true;
    } else out.push(current);
  }
  if (!placed) {
    if (!out.length) out.push("# Memórias do EdiAula", "");
    out.push(line);
  }
  return `${out.join("\n")}\n`;
}

/** The index without the lines pointing at `file`. */
export function removeIndexLine(index: string, file: string): string {
  if (!index) return index;
  const kept = index
    .replace(/\r?\n$/, "")
    .split(/\r?\n/)
    .filter((line) => entryFile(line) !== file);
  return `${kept.join("\n")}\n`;
}

const titleOf = (input: RememberInput): string => {
  const title = oneLine(input.title ?? "").replace(/[[\]()]/g, "");
  if (title) return title;
  const words = input.name.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const isMissing = (err: unknown): boolean =>
  err instanceof Error && "code" in err && err.code === "ENOENT";

export function createMemoryStore(folder: () => string) {
  /** One operation at a time: two memories never race on the index. */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };

  /** The folder, created when missing; a link in its place is refused. */
  async function root(create: boolean): Promise<string | null> {
    const dir = resolve(folder());
    try {
      const info = await lstat(dir);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new MemoryError(
          "A pasta de memória do EdiAula não é uma pasta comum. Nada foi gravado.",
        );
      return dir;
    } catch (err) {
      if (!isMissing(err)) throw err;
      if (!create) return null;
      await mkdir(dir, { recursive: true });
      return dir;
    }
  }

  /** A path in the folder for a file name; anything that would land elsewhere is refused. */
  async function inside(dir: string, name: string): Promise<string> {
    const path = resolve(dir, name);
    if (dirname(path) !== dir || !path.startsWith(dir + sep))
      throw new MemoryError(`Caminho fora da pasta de memória recusado: ${name}`);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile())
        throw new MemoryError(
          `${name} na pasta de memória não é um arquivo comum. Nada foi gravado.`,
        );
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
    return path;
  }

  async function readText(dir: string, name: string): Promise<string> {
    try {
      return await readFile(await inside(dir, name), "utf8");
    } catch (err) {
      if (isMissing(err)) return "";
      throw err;
    }
  }

  async function all(dir: string | null): Promise<Memory[]> {
    if (!dir) return [];
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && FILE.test(entry.name))
      .map((entry) => entry.name);
    const read = await Promise.all(
      files.map(async (file) => parseMemory(file, await readText(dir, file))),
    );
    return read
      .filter((memory): memory is Memory => memory !== null)
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Saves a memory; one with the same name is updated (even when its type changes), never doubled. */
  function remember(input: RememberInput): Promise<{ file: string; updated: boolean }> {
    return serial(async () => {
      checkName(input.name);
      const description = oneLine(input.description);
      if (!description) throw new MemoryError("Falta a descrição de uma linha da memória.");
      if (!input.body.trim()) throw new MemoryError("A memória está vazia.");
      const file = memoryFile(input.type, input.name);
      const text = renderMemory({ ...input, description });
      const bytes = Buffer.byteLength(text, "utf8");
      if (bytes > MEMORY_MAX_BYTES)
        throw new MemoryError(
          `Memória grande demais (${bytes} bytes; o limite é ${MEMORY_MAX_BYTES}). Guarde só a preferência, em poucas linhas.`,
        );
      const dir = (await root(true)) as string;
      const existing = await all(dir);
      const same = existing.filter((m) => m.name === input.name || m.file === file);
      if (!same.length && existing.length >= MEMORY_MAX_COUNT)
        throw new MemoryError(
          `Já há ${MEMORY_MAX_COUNT} memórias. Apague uma que não vale mais (forget) antes de gravar outra.`,
        );
      await atomicWrite(await inside(dir, file), text);
      const previous = same.map((m) => m.file).filter((f) => f !== file);
      for (const old of previous) await rm(await inside(dir, old), { force: true });
      const index = await readText(dir, MEMORY_INDEX);
      const line = `- [${titleOf(input)}](${file}) — ${description}`;
      await atomicWrite(
        await inside(dir, MEMORY_INDEX),
        upsertIndexLine(index, file, line, previous),
      );
      return { file, updated: same.length > 0 };
    });
  }

  /** Deletes a memory and its index line; false when there was none by that name. */
  function forget(name: string): Promise<boolean> {
    return serial(async () => {
      checkName(name);
      const dir = await root(false);
      const found = (await all(dir)).filter((m) => m.name === name);
      if (!dir || !found.length) return false;
      let index = await readText(dir, MEMORY_INDEX);
      for (const memory of found) {
        await rm(await inside(dir, memory.file), { force: true });
        index = removeIndexLine(index, memory.file);
      }
      await atomicWrite(await inside(dir, MEMORY_INDEX), index);
      return true;
    });
  }

  const list = (): Promise<Memory[]> => serial(async () => all(await root(false)));

  /** The memories for the system prompt: whole while they fit, then their index lines. */
  async function prompt(): Promise<string> {
    const memories = await list();
    const head = `# EdiAula memory

Durable preferences the person asked you to keep, saved with remember. Follow them without asking again; a request in this conversation that says otherwise wins for that request. When the person asks you to remember a preference ("lembre que…", "sempre…", "nunca…"), save it with remember: one memory per subject, and reuse the name of a memory below on the same subject to update it instead of adding another. forget deletes one when the person asks. Memories are durable preferences about how the person works in EdiAula, never details of a single lesson.`;
    if (!memories.length) return `${head}\n\nNo memories saved yet.`;
    // Whole while they fit, then index lines while those fit, then only how many were left out.
    const whole: string[] = [];
    const short: string[] = [];
    let used = Buffer.byteLength(head, "utf8") + 200;
    let left = 0;
    for (const m of memories) {
      const block = `<memory name="${m.name}" type="${m.type}" description=${JSON.stringify(m.description)}>\n${m.body}\n</memory>`;
      const size = Buffer.byteLength(block, "utf8") + 2;
      if (!short.length && !left && used + size <= PROMPT_MAX_BYTES) {
        whole.push(block);
        used += size;
        continue;
      }
      const description =
        m.description.length > PROMPT_DESCRIPTION_MAX
          ? `${m.description.slice(0, PROMPT_DESCRIPTION_MAX - 1)}…`
          : m.description;
      const line = `- ${m.name} (${m.type}): ${description}`;
      const lineSize = Buffer.byteLength(line, "utf8") + 1;
      if (!left && used + lineSize <= PROMPT_MAX_BYTES) {
        short.push(line);
        used += lineSize;
      } else left++;
    }
    const more = left ? `\n…and ${left} more; list_memories lists them all.` : "";
    const rest =
      short.length || left
        ? `\n\nMore memories (read one whole with list_memories and its name):\n${short.join("\n")}${more}`
        : "";
    return `${head}\n\n${whole.join("\n\n")}${rest}`;
  }

  return { remember, forget, list, prompt, folder: () => resolve(folder()) };
}

export type MemoryStore = ReturnType<typeof createMemoryStore>;

/** What the memory tools answer (the main process runs them; the editor never sees them). */
export async function runMemoryTool(
  store: MemoryStore,
  name: "remember" | "forget" | "list_memories",
  input: Record<string, unknown>,
): Promise<{ ok: boolean; text: string }> {
  try {
    if (name === "remember") {
      const { file, updated } = await store.remember(input as unknown as RememberInput);
      return {
        ok: true,
        text: `${updated ? "Memória atualizada" : "Memória gravada"}: ${file}. Vale desde já nesta conversa e entra no contexto das próximas.`,
      };
    }
    if (name === "forget") {
      const target = String(input.name ?? "");
      return (await store.forget(target))
        ? { ok: true, text: `Memória apagada: ${target}.` }
        : {
            ok: false,
            text: `Não há memória com o nome ${target}. Veja os nomes com list_memories.`,
          };
    }
    const memories = await store.list();
    const wanted = typeof input.name === "string" && input.name ? input.name : null;
    if (wanted) {
      const memory = memories.find((m) => m.name === wanted);
      return memory
        ? { ok: true, text: renderMemory(memory) }
        : { ok: false, text: `Não há memória com o nome ${wanted}.` };
    }
    return {
      ok: true,
      text: memories.length
        ? memories.map((m) => `- ${m.name} (${m.type}): ${m.description}`).join("\n")
        : "Nenhuma memória gravada.",
    };
  } catch (err) {
    return {
      ok: false,
      text:
        err instanceof MemoryError
          ? err.message
          : `Não consegui mexer na memória: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
