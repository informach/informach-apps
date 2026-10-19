import "./fileDialog.css";
export function setupAssistant(editor) {
  const bridge = window.desktop,
    history = [];
  const panel = document.createElement("aside");
  panel.className = "assistant-panel";
  panel.hidden = true;
  panel.innerHTML = `<header><strong>✧ Assistente</strong><button type="button" aria-label="Fechar assistente" data-close>×</button></header><div class="assistant-settings"><label>Provedor<select aria-label="Provedor de IA"><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label><label>Modelo<input aria-label="Modelo de IA" placeholder="Padrão da sua conta" maxlength="120"></label><p data-status role="status">Verificando conexão…</p><details><summary>Conectar um agente externo</summary><p>Configure a conexão autenticada apenas para esta ferramenta:</p><button type="button" data-connect="claude">Conectar Claude Code</button><button type="button" data-connect="codex">Conectar Codex</button><p>Os clientes usam seus próprios logins. A credencial local não é um token da sua assinatura.</p></details></div><div class="assistant-messages" aria-live="polite"></div><form><textarea aria-label="Mensagem ao assistente" placeholder="Ex.: deixe o mascote menor e selecione Pular" rows="3" maxlength="8000" required></textarea><div><button type="button" data-reset>Nova conversa</button><button type="button" data-stop disabled>Parar</button><button class="primary" type="submit">Enviar</button></div></form>`;
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
    currentText = "";
  try {
    provider.value = localStorage.getItem("edisvg-ai-provider") || "claude";
    model.value = localStorage.getItem("edisvg-ai-model") || "";
  } catch {}
  function message(text, role) {
    const el = document.createElement("div");
    el.className = `chat-message ${role}`;
    el.textContent = text;
    messages.append(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }
  function setBusy(value) {
    busy = value;
    find("[type=submit]").disabled = value || !bridge;
    find("[data-stop]").disabled = !value;
    find("[data-reset]").disabled = value;
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
  find("[data-reset]").onclick = () => {
    history.length = 0;
    messages.replaceChildren();
    message("Nova conversa. O projeto atual foi mantido.", "system");
  };
  find("form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !bridge) return;
    const text = find("textarea").value.trim();
    if (!text) return;
    history.push({ role: "user", text });
    message(text, "user");
    find("textarea").value = "";
    response = message("", "assistant");
    currentText = "";
    setBusy(true);
    try {
      localStorage.setItem("edisvg-ai-provider", provider.value);
      localStorage.setItem("edisvg-ai-model", model.value);
    } catch {}
    const prompt = history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.text}`)
      .join("\n\n")
      .slice(-30000);
    try {
      await bridge.aiSend({ provider: provider.value, model: model.value.trim(), prompt });
    } catch (error) {
      response.textContent = error.message;
      response.classList.add("error");
      setBusy(false);
    }
  };
  if (bridge) {
    bridge.onAssistantEvent((event) => {
      if (event.type === "text") {
        currentText += event.text;
        if (response) response.textContent = currentText;
      }
      if (event.type === "tool") message(`Ferramenta: ${event.text}`, "system");
      if (event.type === "error") message(event.text, "error");
      if (event.type === "done") {
        if (currentText) history.push({ role: "assistant", text: currentText });
        if (response && !response.textContent)
          response.textContent = event.stopped
            ? "Resposta interrompida."
            : "Solicitação concluída.";
        setBusy(false);
      }
      messages.scrollTop = messages.scrollHeight;
    });
    bridge.handleAiTools(async ({ name, input }) => {
      if (name === "get_overview") return { ok: true, text: JSON.stringify(editor.overview()) };
      if (name === "undo" || name === "redo") {
        const changed = editor[name]();
        return {
          ok: changed,
          text: changed ? "Histórico atualizado." : "Não há edição disponível no histórico.",
        };
      }
      const result = await editor.execute(name, input);
      if (!name.startsWith("get_")) message(`Aplicado: ${name}`, "system");
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
        history.length = 0;
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
        history.length = 0;
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
