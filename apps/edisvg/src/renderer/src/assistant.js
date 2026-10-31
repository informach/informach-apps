import { toolPermission } from "../../shared/aiTools.js";
import {
  IMAGE_LIMIT,
  IMAGE_TYPES,
  imageFiles,
  readAttachment,
  referenceImages,
  revokeAttachments,
} from "./assistantImages.ts";
import "./fileDialog.css";
export function setupAssistant(editor) {
  const bridge = window.desktop,
    history = [];
  const panel = document.createElement("aside");
  panel.className = "assistant-panel";
  panel.hidden = true;
  panel.innerHTML = `<header><strong>✧ Assistente</strong><button type="button" aria-label="Fechar assistente" data-close>×</button></header><div class="assistant-settings"><label>Provedor<select aria-label="Provedor de IA"><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label><label>Modelo<input aria-label="Modelo de IA" placeholder="Padrão da sua conta" maxlength="120"></label><p data-status role="status">Verificando conexão…</p><details><summary>Conectar um agente externo</summary><p>Configure a conexão autenticada apenas para esta ferramenta:</p><button type="button" data-connect="claude">Conectar Claude Code</button><button type="button" data-connect="codex">Conectar Codex</button><p>Os clientes usam seus próprios logins. A credencial local não é um token da sua assinatura.</p></details></div><div class="assistant-messages" aria-live="polite"></div><form><div class="assistant-attachments" data-attachments hidden></div><textarea aria-label="Mensagem ao assistente" placeholder="Ex.: deixe o mascote menor e selecione Pular. Cole ou arraste imagens de referência." rows="3" maxlength="8000"></textarea><input type="file" accept="${IMAGE_TYPES.join(",")}" multiple hidden data-file><div><button type="button" data-reset>Nova conversa</button><button type="button" data-attach title="Anexar imagem de referência (também dá para colar ou arrastar)">Imagem</button><button type="button" data-stop disabled>Parar</button><button class="primary" type="submit">Enviar</button></div></form>`;
  document.body.append(panel);
  const find = (s) => panel.querySelector(s),
    messages = find(".assistant-messages"),
    provider = find("select"),
    model = find("input");
  for (const client of ["claude", "codex"]) {
    const button = find(`[data-connect="${client}"]`);
    button.disabled = !bridge;
    button.onclick = async () => {
      button.disabled = true;
      try {
        const result = await bridge.aiConnect(client);
        editor.notify(result.message);
      } catch {
        editor.notify("Não foi possível configurar a conexão local.");
      } finally {
        button.disabled = !bridge;
      }
    };
  }
  let busy = false,
    response = null,
    currentText = "",
    activity = null,
    edits = 0;
  /** The one line of a reply that says what the assistant is doing, in words. */
  function showActivity(text) {
    if (!activity) {
      activity = document.createElement("div");
      activity.className = "chat-activity";
      messages.append(activity);
    }
    activity.classList.add("is-working");
    activity.textContent = `${text}…`;
  }
  /** At the end of a reply the line says how many edits were applied, or goes away. */
  function endActivity() {
    if (activity && edits) {
      activity.classList.remove("is-working");
      activity.textContent =
        edits === 1
          ? "1 alteração aplicada ao projeto · Ctrl+Z desfaz"
          : `${edits} alterações aplicadas ao projeto · Ctrl+Z desfaz`;
    } else activity?.remove();
    activity = null;
    edits = 0;
  }
  /** Images attached to the message being written. */
  let pending = [];
  try {
    provider.value = localStorage.getItem("edisvg-ai-provider") || "claude";
    model.value = localStorage.getItem("edisvg-ai-model") || "";
  } catch {}
  function thumbnails(images, remove) {
    return images.map((image, index) => {
      const item = document.createElement("figure"),
        img = document.createElement("img");
      img.src = image.url;
      img.alt = `Imagem de referência: ${image.name}`;
      item.append(img);
      if (remove) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "attachment-remove";
        button.textContent = "×";
        button.setAttribute("aria-label", `Remover ${image.name}`);
        button.onclick = () => remove(index);
        item.append(button);
      }
      return item;
    });
  }
  function renderPending() {
    const list = find("[data-attachments]");
    list.hidden = !pending.length;
    list.replaceChildren(
      ...thumbnails(pending, (index) => {
        revokeAttachments(pending.splice(index, 1));
        renderPending();
        find("textarea").focus();
      }),
    );
  }
  async function attach(files) {
    for (const file of files) {
      if (pending.length >= IMAGE_LIMIT) {
        editor.notify(`Anexe no máximo ${IMAGE_LIMIT} imagens por mensagem.`);
        break;
      }
      try {
        pending.push(await readAttachment(file));
      } catch (error) {
        editor.notify(error.message);
      }
    }
    renderPending();
  }
  function message(text, role, images = []) {
    const el = document.createElement("div");
    el.className = `chat-message ${role}`;
    el.textContent = text;
    if (images.length) {
      const list = document.createElement("div");
      list.className = "chat-images";
      list.append(...thumbnails(images));
      el.prepend(list);
    }
    messages.append(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }
  function setBusy(value) {
    busy = value;
    find("[type=submit]").disabled = value || !bridge;
    find("[data-stop]").disabled = !value;
    find("[data-reset]").disabled = value;
    find("[data-attach]").disabled = value || !bridge;
    provider.disabled = value;
    model.disabled = value;
  }
  async function status() {
    if (!bridge) {
      find("[data-status]").textContent = "O assistente está disponível no aplicativo desktop.";
      setBusy(false);
      return;
    }
    try {
      const s = await bridge.aiStatus();
      find("[data-status]").textContent =
        s.mcp.error ||
        s.clients
          .map(
            (c) =>
              `${c.id === "claude" ? "Claude Code" : "Codex"}: ${c.installed ? "instalado" : "não encontrado"}`,
          )
          .join(" · ");
    } catch (error) {
      find("[data-status]").textContent = error.message;
    }
  }
  function toggle() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      void status();
      find("textarea").focus();
    }
  }
  find("[data-close]").onclick = () => {
    panel.hidden = true;
  };
  find("[data-stop]").onclick = () => bridge?.aiStop();
  const fileInput = find("[data-file]");
  find("[data-attach]").onclick = () => fileInput.click();
  fileInput.onchange = () => {
    void attach([...fileInput.files]);
    fileInput.value = "";
  };
  find("textarea").addEventListener("paste", (event) => {
    const files = imageFiles(event.clipboardData);
    if (!files.length || busy || !bridge) return;
    event.preventDefault();
    void attach(files);
  });
  panel.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    panel.classList.add("is-dropping");
  });
  panel.addEventListener("dragleave", (event) => {
    if (!panel.contains(event.relatedTarget)) panel.classList.remove("is-dropping");
  });
  panel.addEventListener("drop", (event) => {
    panel.classList.remove("is-dropping");
    const files = imageFiles(event.dataTransfer);
    if (!files.length) return;
    event.preventDefault();
    if (busy || !bridge) return;
    void attach(files);
  });
  /** Forgets the conversation and frees its thumbnails. */
  function clearHistory() {
    revokeAttachments(history.flatMap((entry) => entry.images ?? []));
    history.length = 0;
  }
  find("[data-reset]").onclick = () => {
    clearHistory();
    messages.replaceChildren();
    message("Nova conversa. O projeto atual foi mantido.", "system");
  };
  find("form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !bridge) return;
    const images = pending,
      text =
        find("textarea").value.trim() ||
        (images.length ? "Use a imagem anexada como referência." : "");
    if (!text) {
      find("textarea").focus();
      return;
    }
    history.push({ role: "user", text, images });
    message(text, "user", images);
    pending = [];
    renderPending();
    find("textarea").value = "";
    response = message("", "assistant");
    response.hidden = true;
    currentText = "";
    showActivity("Pensando");
    setBusy(true);
    try {
      localStorage.setItem("edisvg-ai-provider", provider.value);
      localStorage.setItem("edisvg-ai-model", model.value);
    } catch {}
    const recent = history.slice(-8),
      attached = (count) =>
        count === 1
          ? "[1 imagem de referência anexada] "
          : count
            ? `[${count} imagens de referência anexadas] `
            : "",
      prompt = recent
        .map(
          (m) =>
            `${m.role === "user" ? "Usuário" : "Assistente"}: ${attached(m.images?.length ?? 0)}${m.text}`,
        )
        .join("\n\n")
        .slice(-30000);
    try {
      await bridge.aiSend({
        provider: provider.value,
        model: model.value.trim(),
        prompt,
        images: referenceImages(recent),
      });
    } catch (error) {
      response.textContent = error.message;
      response.classList.add("error");
      response.hidden = false;
      endActivity();
      setBusy(false);
    }
  };
  if (bridge) {
    bridge.onAssistantEvent((event) => {
      if (event.type === "text") {
        currentText += event.text;
        if (response) {
          response.textContent = currentText;
          response.hidden = false;
          // The reply itself shows it is moving; the line comes back with the next tool.
          if (activity) activity.hidden = true;
        }
      }
      if (event.type === "tool") {
        showActivity(event.text);
        activity.hidden = false;
        messages.append(activity);
      }
      if (event.type === "error") message(event.text, "error");
      if (event.type === "done") {
        if (currentText) history.push({ role: "assistant", text: currentText });
        if (response && !response.textContent && !(edits && !event.stopped))
          response.textContent = event.stopped
            ? "Resposta interrompida."
            : "Solicitação concluída.";
        if (response) response.hidden = !response.textContent;
        if (activity) activity.hidden = false;
        endActivity();
        setBusy(false);
      }
      messages.scrollTop = messages.scrollHeight;
    });
    bridge.handleAiTools(async ({ name, input }) => {
      if (name === "get_overview") return { ok: true, text: JSON.stringify(editor.overview()) };
      if (name === "undo" || name === "redo") {
        const changed = editor[name]();
        if (changed) edits++;
        return {
          ok: changed,
          text: changed ? "Histórico atualizado." : "Não há edição disponível no histórico.",
        };
      }
      const result = await editor.execute(name, input);
      if (toolPermission(name) === "write") edits++;
      return { ok: true, text: JSON.stringify(result ?? editor.overview()) };
    });
    bridge.onCommand((command) => {
      if (command === "new") void createNew();
      else if (command === "import-svg") void editor.importSvg();
      else if (command === "assistant") toggle();
      else if (command === "open") void openProject();
      else if (command === "save" || command === "save-as") void saveProject(command === "save-as");
      else if (command === "undo" || command === "redo") editor[command]();
    });
  }
  async function createNew() {
    if (busy) {
      editor.notify("Interrompa a IA antes de criar um projeto.");
      return;
    }
    try {
      const value = await bridge.projectNew();
      if (value) {
        clearHistory();
        messages.replaceChildren();
        editor.restore(value.project);
        editor.fileStatus(value.status);
        editor.notify("Novo projeto criado.");
      }
    } catch (error) {
      editor.notify(error.message);
    }
  }
  async function openProject() {
    if (busy) {
      editor.notify("Interrompa a resposta da IA antes de abrir outro projeto.");
      return;
    }
    try {
      const value = await bridge.projectOpen();
      if (value) {
        clearHistory();
        messages.replaceChildren();
        editor.restore(value.project);
        editor.fileStatus(value.status);
        editor.notify("Projeto aberto.");
      }
    } catch (error) {
      editor.notify(error.message);
    }
  }
  async function saveProject(as = false) {
    try {
      const result = await bridge.projectSave(editor.snapshot(), as);
      editor.fileStatus(result);
      if (result.saved) editor.notify(result.warning ?? "Projeto salvo em arquivo.");
    } catch (error) {
      editor.notify(error.message);
    }
  }
  window.ediSuite?.onRecovery(async () => {
    const result = await bridge.projectSave(editor.snapshot(), false);
    editor.fileStatus(result);
    if (!result.saved) throw new Error("Recovery save canceled");
    if (result.warning) editor.notify(result.warning);
  });
  async function fileMenu() {
    if (!bridge) {
      editor.notify("Abra a versão desktop para salvar e abrir arquivos.");
      return;
    }
    if (document.querySelector(".file-dialog")) return;
    const opener = document.activeElement;
    const d = document.createElement("dialog");
    d.className = "file-dialog";
    d.setAttribute("aria-labelledby", "file-dialog-title");
    d.setAttribute("aria-describedby", "file-dialog-description");
    const actions = [
      ["new", "＋", "Novo projeto", "Comece com uma tela em branco.", "Ctrl+N"],
      ["open", "↗", "Abrir projeto…", "Continue editando um arquivo .edisvg.", "Ctrl+O"],
      ["import", "↓", "Importar SVG…", "Substitua a arte atual por um SVG.", "Ctrl+I"],
    ];
    d.innerHTML = `<header class="file-dialog-header"><div><h2 id="file-dialog-title">Arquivo</h2><p id="file-dialog-description">Crie, abra ou salve seu projeto.</p></div><button data-close-file aria-label="Fechar janela" title="Fechar (Esc)">×</button></header><div class="file-dialog-actions">${actions.map(([id, icon, title, description, shortcut]) => `<button class="file-dialog-action" data-${id}><span class="file-action-icon" aria-hidden="true">${icon}</span><span class="file-action-copy"><strong>${title}</strong><span>${description}</span></span><kbd>${shortcut}</kbd></button>`).join("")}</div><section class="file-dialog-save" aria-labelledby="file-save-title"><div class="file-save-heading"><h3 id="file-save-title">Salvar projeto atual</h3><span>.edisvg</span></div><div class="file-save-buttons"><button class="primary" data-save autofocus>Salvar <kbd>Ctrl+S</kbd></button><button data-save-as>Salvar como… <kbd>Ctrl+Shift+S</kbd></button></div></section><footer class="file-dialog-footer"><span>Esc para fechar</span><button data-cancel>Voltar ao editor</button></footer>`;
    document.body.append(d);
    d.onclose = () => {
      d.remove();
      if (opener?.isConnected) opener.focus();
    };
    const handlers = {
      new: createNew,
      import: () => editor.importSvg(),
      open: openProject,
      save: () => saveProject(),
      "save-as": () => saveProject(true),
    };
    for (const [action, handler] of Object.entries(handlers))
      d.querySelector(`[data-${action}]`).onclick = () => {
        d.close();
        void handler();
      };
    d.querySelector("[data-cancel]").onclick = () => d.close();
    d.querySelector("[data-close-file]").onclick = () => d.close();
    d.showModal();
  }
  return { toggle, fileMenu };
}
