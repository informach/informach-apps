import { realpath } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { app, type BrowserWindow, dialog } from "electron";
import { classifyPath, insideAny, type PathVerdict, usableRoots } from "../shared/aiPaths.ts";

/**
 * Checks a path an AI sent before anything opens it (shared/aiPaths.ts has the rules). Links
 * are inspected without following them first, so a folder link pointing at a network share is
 * refused before Windows connects to it. Inside the project folder, the usual media folders or
 * a folder the lesson already uses, the path is accepted; anywhere else the person is asked.
 */

let context: { projectPath: string | null; mediaFolders: string[] } = {
  projectPath: null,
  mediaFolders: [],
};

/** The open project and the folders of its media, reported by the editor. */
export function setAiPathContext(next: {
  projectPath: string | null;
  mediaFolders: string[];
}): void {
  context = next;
}

/** A question about a file outside the usual folders is refused after this. */
const QUESTION_TIMEOUT_MS = 60_000;

/** Files outside the usual folders the person allowed in this session. */
const allowed = new Set<string>();

const refuse = (reason: string): PathVerdict => ({ ok: false, reason });

/** The final path Windows opens, links resolved (a mapped network drive comes back as a share). */
const realNative = promisify(realpath.native);

/** `\\?\C:\x` (how Windows reports some link targets) as `C:\x`; anything else as it is. */
const plainTarget = (target: string): string =>
  /^\\\\\?\\[a-z]:\\/i.test(target) ? target.slice(4) : target;

/** Refuses a path with a link (symbolic link or junction) on the way that leads off this computer. */
async function linksStayLocal(path: string): Promise<PathVerdict> {
  const parts = path.slice(3).split("\\").filter(Boolean);
  let current = path.slice(0, 3);
  for (const part of parts) {
    current = join(current, part);
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(current);
    } catch {
      return refuse("o arquivo não foi encontrado");
    }
    if (!info.isSymbolicLink()) continue;
    const raw = plainTarget(await readlink(current));
    const target = isAbsolute(raw) ? raw : resolve(dirname(current), raw);
    const verdict = classifyPath(target);
    if (!verdict.ok)
      return refuse(`um atalho no caminho leva para fora deste computador (${verdict.reason})`);
  }
  return { ok: true, path };
}

const usualFolders = (): string[] =>
  (["documents", "downloads", "videos", "music", "pictures"] as const).map((name) =>
    app.getPath(name),
  );

export async function checkAiPath(win: BrowserWindow | null, path: string): Promise<PathVerdict> {
  const syntax = classifyPath(path);
  if (!syntax.ok) return syntax;
  const links = await linksStayLocal(syntax.path);
  if (!links.ok) return links;
  let real: string;
  try {
    real = await realNative(syntax.path);
  } catch {
    return refuse("o arquivo não foi encontrado");
  }
  const resolved = classifyPath(real);
  if (!resolved.ok) return refuse(`o arquivo fica fora deste computador (${resolved.reason})`);
  // Folders on another computer never count (and are not touched to find out), nor a whole
  // drive or the profile folder itself.
  const home = app.getPath("home");
  const roots = usableRoots(
    [
      ...(context.projectPath ? [dirname(context.projectPath)] : []),
      ...usualFolders(),
      ...context.mediaFolders,
    ],
    home,
  );
  const realRoots = usableRoots(
    await Promise.all(roots.map((root) => realNative(root).catch(() => root))),
    home,
  );
  if (
    insideAny(resolved.path, [...roots, ...realRoots]) ||
    allowed.has(resolved.path.toLowerCase())
  )
    return resolved;
  // The question closes by itself, as a refusal, when nobody answers.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), QUESTION_TIMEOUT_MS);
  const answer =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, {
          signal: deadline.signal,
          type: "question",
          buttons: ["Permitir", "Recusar"],
          defaultId: 1,
          cancelId: 1,
          title: "EdiAula",
          message: "A IA quer usar um arquivo fora das pastas de mídia",
          detail: `${resolved.path}\n\nPermita só se você reconhece este arquivo.`,
        })
      : { response: 1 };
  clearTimeout(timer);
  if (answer.response !== 0) return refuse("a pessoa não permitiu usar esse arquivo");
  allowed.add(resolved.path.toLowerCase());
  return resolved;
}
