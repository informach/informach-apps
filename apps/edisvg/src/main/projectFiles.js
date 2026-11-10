import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { contentSnapshot, newProject, parseProject } from "../shared/project.js";
import { serializeProject } from "../shared/projectPolicy.ts";
import { PROJECT_BYTES, parseJsonText, readBoundedText } from "./boundedText.ts";

export { atomicWrite };

/** A project as "Novo" makes it, never edited (its id aside): nothing in it to ask about. */
const blankContent = JSON.stringify({ ...contentSnapshot(newProject()), id: null });
const isBlank = (project) =>
  JSON.stringify({ ...contentSnapshot(project), id: null }) === blankContent;

export function createProjectFiles({
  chooseSave,
  chooseOpen,
  confirm,
  onDiscard = async () => {},
  checkpoint = async () => {},
  write = atomicWrite,
  read = (path) => readBoundedText(path, PROJECT_BYTES),
  exists = (path) => existsSync(path),
  backup = (path, text, version) => atomicWrite(`${path}.v${version}.${randomUUID()}.bak`, text),
}) {
  let path = null,
    draft = null,
    saved = null,
    busy = false,
    diskText = null,
    sourceVersion = null,
    // The id of the lesson's project the main process switched to on its own (openOrCreate),
    // until the window sends an edit of it: edits of the project before are left out meanwhile.
    adopting = null;
  const encoded = () => JSON.stringify(draft ? contentSnapshot(draft) : null);
  function status() {
    return {
      path,
      name: path ? basename(path) : "Sem arquivo",
      dirty: !!draft && encoded() !== saved,
    };
  }
  /**
   * An edit of the window. After the main process switched to a lesson's project on its own, an
   * edit with another id is of the project open before, sent before the window took the new one
   * (a project keeps its id while open): it is left out, never written under the lesson's file.
   */
  async function changed(project) {
    const next = parseProject(project);
    if (adopting !== null) {
      if (next.id !== adopting) return status();
      adopting = null;
    }
    draft = next;
    await checkpoint(status().dirty ? draft : null);
    return status();
  }
  async function saveInternal(as = false) {
    if (!draft) throw new Error("O editor ainda não está pronto.");
    const destination = as || !path ? await chooseSave(path) : path;
    if (!destination) return { saved: false, ...status() };
    const project = structuredClone(draft);
    const content = serializeProject(project);
    if (destination === path && diskText !== null) {
      const current = await read(destination);
      if (!as && current !== diskText)
        throw new Error(
          "O arquivo foi alterado fora do EdiSVG. Use Salvar como para preservar as duas versões.",
        );
      if (sourceVersion !== null && sourceVersion < project.version)
        await backup(destination, current, sourceVersion);
    }
    await write(destination, content);
    path = destination;
    diskText = content;
    sourceVersion = project.version;
    saved = JSON.stringify(contentSnapshot(project));
    try {
      await checkpoint(status().dirty ? draft : null);
    } catch (error) {
      console.error(
        "[edisvg] checkpoint_after_save_failed",
        error instanceof Error ? error.name : "unknown",
      );
      return {
        saved: true,
        ...status(),
        warning:
          "O arquivo foi salvo, mas a cópia de recuperação não pôde ser atualizada. A cópia anterior foi preservada; confira o armazenamento local.",
      };
    }
    return { saved: true, ...status() };
  }
  async function guard() {
    if (!status().dirty) return true;
    const confirmed = encoded();
    const choice = await confirm();
    if (encoded() !== confirmed) return false;
    if (choice === "discard") {
      await checkpoint(null);
      if (encoded() !== confirmed) {
        await checkpoint(draft);
        return false;
      }
      await onDiscard();
      return encoded() === confirmed;
    }
    if (choice === "save") return (await saveInternal()).saved && !status().dirty;
    return false;
  }
  /**
   * Reads the project at `selected` and makes it the open one, after the unsaved-work question
   * (skipped, with `skipBlank`, for an untouched blank project without a file).
   */
  async function load(selected, skipBlank = false) {
    const text = await read(selected);
    if (Buffer.byteLength(text, "utf8") > PROJECT_BYTES) throw new Error("Projeto muito grande.");
    const raw = parseJsonText(text);
    const project = parseProject(raw);
    if (!(skipBlank && blankDraft()) && !(await guard())) return null;
    await checkpoint(null);
    adopting = null;
    draft = project;
    saved = JSON.stringify(contentSnapshot(project));
    path = selected;
    diskText = text;
    sourceVersion = raw.version;
    return { project, status: status() };
  }
  /** The open project is a blank one without a file, never edited. */
  const blankDraft = () => !path && !!draft && isBlank(draft);
  async function exclusive(fn) {
    if (busy) throw new Error("Há uma operação de arquivo em andamento.");
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  }
  return {
    status,
    changed,
    recover: (project, { persist = true } = {}) =>
      exclusive(async () => {
        const restored = parseProject(project);
        if (persist) await checkpoint(restored);
        draft = restored;
        path = null;
        diskText = null;
        sourceVersion = null;
        saved = null;
        return { project: structuredClone(draft), status: status() };
      }),
    isBusy: () => busy,
    new: () =>
      exclusive(async () => {
        if (!(await guard())) return null;
        const project = newProject();
        await checkpoint(project);
        draft = project;
        saved = null;
        path = null;
        diskText = null;
        sourceVersion = null;
        return { project: structuredClone(draft), status: status() };
      }),
    save: (as = false) => exclusive(() => saveInternal(as)),
    canClose: () => exclusive(guard),
    open: () =>
      exclusive(async () => {
        const selected = await chooseOpen();
        if (!selected) return null;
        return load(selected);
      }),
    /**
     * The project of a lesson ("Animar no EdiSVG" in EdiAula): the file at `target` opened, or,
     * the first time, a new project named after the lesson saved there. Already open, it stays as
     * it is (`same`), unsaved work included. Null when the person keeps the open project. An
     * untouched blank project (EdiSVG just opened) gives way without the unsaved-work question.
     */
    openOrCreate: (target, name) =>
      exclusive(async () => {
        if (path && path.toLowerCase() === target.toLowerCase())
          return { project: structuredClone(draft), status: status(), same: true };
        if (exists(target)) {
          const opened = await load(target, true);
          if (opened) adopting = opened.project.id ?? null;
          return opened;
        }
        if (!blankDraft() && !(await guard())) return null;
        const project = parseProject({
          ...newProject(),
          name: name.trim().slice(0, 120) || "Aula",
        });
        const content = serializeProject(project);
        await write(target, content);
        await checkpoint(null);
        draft = project;
        saved = JSON.stringify(contentSnapshot(project));
        path = target;
        diskText = content;
        sourceVersion = project.version;
        adopting = project.id ?? null;
        return { project: structuredClone(draft), status: status() };
      }),
  };
}
