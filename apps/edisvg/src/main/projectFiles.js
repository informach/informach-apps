import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import { contentSnapshot, newProject, parseProject } from "../shared/project.js";
import { serializeProject } from "../shared/projectPolicy.ts";
import { PROJECT_BYTES, parseJsonText, readBoundedText } from "./boundedText.ts";

export { atomicWrite };
export function createProjectFiles({
  chooseSave,
  chooseOpen,
  confirm,
  onDiscard = async () => {},
  checkpoint = async () => {},
  write = atomicWrite,
  read = (path) => readBoundedText(path, PROJECT_BYTES),
  backup = (path, text, version) => atomicWrite(`${path}.v${version}.${randomUUID()}.bak`, text),
}) {
  let path = null,
    draft = null,
    saved = null,
    busy = false,
    diskText = null,
    sourceVersion = null;
  const encoded = () => JSON.stringify(draft ? contentSnapshot(draft) : null);
  function status() {
    return {
      path,
      name: path ? basename(path) : "Sem arquivo",
      dirty: !!draft && encoded() !== saved,
    };
  }
  async function changed(project) {
    draft = parseProject(project);
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
        const text = await read(selected);
        if (Buffer.byteLength(text, "utf8") > PROJECT_BYTES)
          throw new Error("Projeto muito grande.");
        const raw = parseJsonText(text);
        const project = parseProject(raw);
        if (!(await guard())) return null;
        await checkpoint(null);
        draft = project;
        saved = JSON.stringify(contentSnapshot(project));
        path = selected;
        diskText = text;
        sourceVersion = raw.version;
        return { project, status: status() };
      }),
  };
}
