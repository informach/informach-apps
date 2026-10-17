import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { basename } from "node:path";
import { newProject, parseProject } from "../shared/project.js";

export async function atomicWrite(path, content) {
  const temp = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temp, "wx");
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temp, path);
  } finally {
    await handle?.close();
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
export function createProjectFiles({
  chooseSave,
  chooseOpen,
  confirm,
  onDiscard = async () => {},
  write = atomicWrite,
  read = (path) => readFile(path, "utf8"),
}) {
  let path = null,
    draft = null,
    saved = null,
    busy = false;
  const encoded = () => JSON.stringify(draft);
  function status() {
    return {
      path,
      name: path ? basename(path) : "Sem arquivo",
      dirty: !!draft && encoded() !== saved,
    };
  }
  function changed(project) {
    draft = parseProject(project);
    return status();
  }
  async function saveInternal(as = false) {
    if (!draft) throw new Error("O editor ainda não está pronto.");
    const destination = as || !path ? await chooseSave(path) : path;
    if (!destination) return { saved: false, ...status() };
    const project = structuredClone(draft);
    await write(destination, JSON.stringify(project, null, 2));
    path = destination;
    saved = JSON.stringify(project);
    return { saved: true, ...status() };
  }
  async function guard() {
    if (!status().dirty) return true;
    const choice = await confirm();
    if (choice === "discard") {
      await onDiscard();
      return true;
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
    isBusy: () => busy,
    new: () =>
      exclusive(async () => {
        if (!(await guard())) return null;
        draft = newProject();
        saved = null;
        path = null;
        return { project: structuredClone(draft), status: status() };
      }),
    save: (as = false) => exclusive(() => saveInternal(as)),
    canClose: () => exclusive(guard),
    open: () =>
      exclusive(async () => {
        const selected = await chooseOpen();
        if (!selected) return null;
        const text = await read(selected);
        if (text.length > 8000000) throw new Error("Projeto muito grande.");
        const project = parseProject(JSON.parse(text));
        if (!(await guard())) return null;
        draft = project;
        saved = JSON.stringify(project);
        path = selected;
        return { project, status: status() };
      }),
  };
}
