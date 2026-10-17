import { contextBridge, ipcRenderer, webUtils } from "electron";
import { desktopStatusSchema, type EdiDesktopBridge, recoveryIdSchema } from "./contracts";
export function filePathForDrop(file: File): string {
  const path = webUtils.getPathForFile(file);
  if (path) ipcRenderer.send("edi:file-drop", path);
  return path;
}
/** Fixed capabilities only: no generic invoke/send and no credentials cross this boundary. */
export function exposeEdiBridge() {
  const api: EdiDesktopBridge = {
    status: async () => desktopStatusSchema.parse(await ipcRenderer.invoke("edi:status")),
    connect: () => ipcRenderer.invoke("edi:connect"),
    logout: () => ipcRenderer.invoke("edi:logout"),
    refresh: () => ipcRenderer.invoke("edi:refresh"),
    account: () => ipcRenderer.invoke("edi:account"),
    checkUpdate: () => ipcRenderer.invoke("edi:update"),
    recover: () => ipcRenderer.invoke("edi:recover"),
    onStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, raw: unknown) =>
        callback(desktopStatusSchema.parse(raw));
      ipcRenderer.on("edi:status-changed", listener);
      return () => {
        ipcRenderer.removeListener("edi:status-changed", listener);
      };
    },
    onRecovery: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, rawId: unknown) => {
        const id = recoveryIdSchema.parse(rawId);
        Promise.resolve()
          .then(callback)
          .then(
            () => ipcRenderer.invoke("edi:recovery-result", { id, ok: true }),
            () => ipcRenderer.invoke("edi:recovery-result", { id, ok: false }),
          )
          .catch(() => {
            console.error("[edi] recovery_confirmation_failed");
          });
      };
      ipcRenderer.on("edi:recover-request", listener);
      return () => {
        ipcRenderer.removeListener("edi:recover-request", listener);
      };
    },
  };
  contextBridge.exposeInMainWorld("ediSuite", api);
  return api;
}

/** Existing editors keep their UI. When restricted, their DOM becomes inert;
 * recovery runs through a dedicated event while main-process gates remain authoritative. */
export function protectEditor() {
  const api = exposeEdiBridge();
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      const shield = document.createElement("dialog");
      shield.setAttribute("aria-label", "Acesso à Suíte Edi");
      shield.style.cssText =
        "position:fixed;inset:0;margin:0;border:0;max-width:none;max-height:none;width:100vw;height:100vh;box-sizing:border-box;z-index:2147483647;background:#15171cf5;color:#f5f3ed;display:grid;place-content:center;gap:18px;padding:40px;font:16px system-ui;";
      // A z-index overlay cannot cover an existing native modal in the top layer.
      // The access shield must itself participate in that same modal stack.
      shield.addEventListener("cancel", (event) => event.preventDefault());
      const heading = document.createElement("h1");
      heading.textContent = "Seu trabalho continua preservado.";
      const message = document.createElement("p");
      message.setAttribute("role", "status");
      const actions = document.createElement("div");
      const controls: HTMLButtonElement[] = [];
      actions.style.cssText = "display:flex;gap:12px;flex-wrap:wrap";
      const run = (action: () => Promise<void>) => {
        action().catch((error: unknown) => {
          message.textContent = error instanceof Error ? error.message : "Operação indisponível";
        });
      };
      for (const [label, action] of [
        ["Conectar conta", api.connect],
        ["Verificar acesso", api.refresh],
        ["Minha assinatura", api.account],
        ["Salvar trabalho existente", api.recover],
      ] satisfies [string, () => Promise<void>][]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText =
          "padding:12px 18px;border:1px solid #f5f3ed;background:#f1b95b;color:#15171c;border-radius:8px;cursor:pointer;font:inherit";
        button.addEventListener("click", () => {
          run(action);
        });
        actions.append(button);
        controls.push(button);
      }
      shield.append(heading, message, actions);
      document.body.append(shield);
      let restricted = true;
      let previousFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      const previousInert = new Map<HTMLElement, boolean>();
      const restrictChildren = () => {
        if (!restricted) {
          for (const [child, inert] of previousInert) child.inert = inert;
          previousInert.clear();
          return;
        }
        for (const child of document.body.children) {
          if (child instanceof HTMLElement && child !== shield) {
            if (!previousInert.has(child)) previousInert.set(child, child.inert);
            child.inert = true;
          }
        }
      };
      restrictChildren();
      shield.showModal();
      controls[0]?.focus({ preventScroll: true });
      // Editors may append floating panels after startup or during recovery.
      // Newly created roots must not escape the current read-only state.
      const observer = new MutationObserver(restrictChildren);
      observer.observe(document.body, { childList: true });
      window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
      const render = (status: Awaited<ReturnType<EdiDesktopBridge["status"]>>) => {
        const wasRestricted = restricted;
        restricted = status.state !== "licensed";
        if (restricted && !wasRestricted)
          previousFocus =
            document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        shield.style.display = restricted ? "grid" : "none";
        restrictChildren();
        if (restricted && !shield.open) shield.showModal();
        else if (!restricted && shield.open) shield.close();
        if (restricted && !wasRestricted) {
          controls[0]?.focus({ preventScroll: true });
        } else if (!restricted && wasRestricted) {
          if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
          previousFocus = undefined;
        }
        message.textContent = status.userCode
          ? `${status.reason} Código: ${status.userCode}`
          : status.reason;
      };
      const protectKeyboard = (event: KeyboardEvent) => {
        if (restricted) {
          event.stopImmediatePropagation();
          if (!(event.target instanceof Node) || !shield.contains(event.target)) {
            event.preventDefault();
            controls[0]?.focus({ preventScroll: true });
          } else if (event.type === "keydown" && event.key === "Tab") {
            const boundary = event.shiftKey ? controls[0] : controls.at(-1);
            if (document.activeElement === boundary) {
              event.preventDefault();
              (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
            }
          }
        }
      };
      // Keep native keyboard activation of the suite buttons while stopping
      // editor shortcuts, including handlers attached to window.
      window.addEventListener("keydown", protectKeyboard, { capture: true });
      window.addEventListener("keyup", protectKeyboard, { capture: true });
      window.addEventListener("keypress", protectKeyboard, { capture: true });
      api.onStatus(render);
      api
        .status()
        .then(render)
        .catch(() => {
          message.textContent =
            "Não foi possível validar a sessão. Seu trabalho permanece preservado.";
        });
    },
    { once: true },
  );
}
