const IMAGE_WIDTH = 1280;
const IMAGE_BYTES = 2_000_000;
const NAMES = { "claude-code": "Claude Code", codex: "Codex" };

/** A sanitized PNG/JPEG data URL as the JPEG the model receives (at most 1280 px, 2 MB). */
export async function taskImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, IMAGE_WIDTH / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      const data = url.slice(url.indexOf(",") + 1);
      if ((data.length * 3) / 4 <= IMAGE_BYTES) return data;
    }
    throw new Error("A imagem é grande demais para o assistente.");
  } finally {
    canvas.width = 0;
  }
}

/**
 * The assistant on the person's own Claude Code or Codex (phase 8). One task at a time:
 * `review` shows exactly what leaves the computer and asks which client to use; `run` starts it
 * and routes the events of that run only. A task ends with its run, a stop, a new task or a
 * document change; later events are ignored.
 */
export function createAssistant({ api }) {
  const dialog = document.createElement("dialog");
  dialog.id = "ai-review";
  dialog.setAttribute("aria-labelledby", "ai-review-title");
  dialog.innerHTML = `<h2 id="ai-review-title">Conferir antes de enviar</h2><p>Vai para o assistente escolhido, com a sua própria conta. O EdiCaptura não envia mais nada: nem originais, nem outras capturas, nem arquivos.</p><div id="ai-review-images"></div><label>Também vai este texto<textarea id="ai-review-meta" readonly rows="4"></textarea></label><label id="ai-review-text-label"><input type="checkbox" id="ai-review-include-text"> Enviar também o texto visível na imagem</label><textarea id="ai-review-text" readonly rows="5"></textarea><label>Assistente <select id="ai-review-client"></select></label><p id="ai-review-problem" role="alert"></p><footer><button type="button" id="ai-review-cancel">Cancelar</button><button type="button" id="ai-review-send" class="primary">Enviar</button></footer>`;
  document.body.append(dialog);
  const $ = (id) => document.getElementById(id);
  let active = null;
  api.onAiEvent((event) => {
    if (!active || event.runId !== active.runId) return;
    const handlers = active.handlers;
    if (event.type === "proposal") handlers.proposal(event);
    else if (event.type === "ended") {
      active = null;
      handlers.end();
    } else handlers.event(event);
  });
  async function clients() {
    try {
      return (await api.aiClients()).filter((client) => client.installed);
    } catch {
      return [];
    }
  }
  /**
   * Shows the images and text of `context` and the installed clients. Resolves to the context to
   * send (without the text when the person unchecked it) and the client, or null.
   */
  async function review(context) {
    const installed = await clients();
    const images =
      context.task === "capture-details"
        ? [context.image]
        : context.steps.map((step) => step.image);
    $("ai-review-images").replaceChildren(
      ...images.map((data, index) => {
        const image = document.createElement("img");
        image.src = `data:image/jpeg;base64,${data}`;
        image.alt = `Imagem ${index + 1} que será enviada`;
        return image;
      }),
    );
    // Every text the task carries is shown, not only the recognized one.
    $("ai-review-meta").value =
      context.task === "capture-details"
        ? `Nome: ${context.name}\nEtiquetas: ${context.tags.join(", ") || "(nenhuma)"}`
        : [
            `Guia: ${context.title}`,
            ...context.steps.map(
              (step, index) =>
                `Passo ${index + 1}: título “${step.title}”; descrição “${step.description}”; texto alternativo “${step.alt}”`,
            ),
          ].join("\n");
    const text = context.task === "capture-details" ? context.text : "";
    $("ai-review-text-label").hidden = !text;
    $("ai-review-text").hidden = !text;
    $("ai-review-text").value = text;
    $("ai-review-include-text").checked = false;
    $("ai-review-client").replaceChildren(
      ...installed.map(
        (client) =>
          new Option(`${client.name}${client.version ? ` ${client.version}` : ""}`, client.id),
      ),
    );
    $("ai-review-problem").textContent = installed.length
      ? ""
      : "Nenhum assistente encontrado. Instale o Claude Code (claude.com/code) ou o Codex e entre com a sua conta; o trabalho aqui continua igual.";
    $("ai-review-send").disabled = !installed.length;
    dialog.showModal();
    return new Promise((resolve) => {
      const finish = (value) => {
        dialog.close();
        resolve(value);
      };
      $("ai-review-cancel").onclick = () => finish(null);
      dialog.oncancel = () => resolve(null);
      $("ai-review-send").onclick = () =>
        finish({
          client: $("ai-review-client").value,
          context:
            context.task === "capture-details" && !$("ai-review-include-text").checked
              ? { ...context, text: "" }
              : context,
        });
    });
  }
  async function run(context, client, handlers) {
    stop();
    const pending = { runId: null, handlers, task: context.task };
    active = pending;
    try {
      const { runId } = await api.aiTaskStart({ client, context });
      if (active === pending) pending.runId = runId;
      return { runId, name: NAMES[client] };
    } catch (error) {
      if (active === pending) active = null;
      throw error;
    }
  }
  /** Ends the running task; with `task`, only a task of that kind. */
  function stop(task) {
    if (!active || (task && active.task !== task)) return false;
    active = null;
    void api.aiTaskStop();
    return true;
  }
  return { review, run, stop, busy: (task) => !!active && (!task || active.task === task) };
}

/** "Sugerir título e etiquetas" for the open capture, with preview, apply and undo. */
export function mountCaptureAssistant({ assistant, engine, current, visibleText, apply, toast }) {
  const panel = document.createElement("details");
  panel.id = "ai-panel";
  panel.innerHTML = `<summary>Assistente (sua assinatura)</summary><p>Claude Code ou Codex com a sua conta. Você confere o que vai e decide o que aplicar.</p><button type="button" id="ai-capture-details">Sugerir título e etiquetas</button><button type="button" id="ai-stop" hidden>Parar</button><p id="ai-status" role="status"></p><div id="ai-proposal" hidden><p id="ai-proposal-text"></p><button type="button" id="ai-apply" class="primary">Aplicar</button><button type="button" id="ai-discard">Descartar</button></div><button type="button" id="ai-undo" hidden>Desfazer sugestão aplicada</button>`;
  document.querySelector(".editor-extras")?.append(panel);
  const $ = (id) => document.getElementById(id);
  let proposal = null,
    undo = null;
  const status = (text) => {
    $("ai-status").textContent = text;
  };
  const render = () => {
    const image = current()?.kind === "image" && !!engine.image;
    $("ai-capture-details").disabled = !image || assistant.busy();
    $("ai-stop").hidden = !assistant.busy();
    $("ai-proposal").hidden = !proposal;
    $("ai-undo").hidden = !undo;
    if (proposal)
      $("ai-proposal-text").textContent =
        `Título: “${proposal.proposal.title}”. Etiquetas: ${proposal.proposal.tags.join(", ") || "(nenhuma)"}.`;
  };
  $("ai-capture-details").onclick = async () => {
    try {
      const doc = current();
      const context = {
        task: "capture-details",
        targetId: doc.id,
        name: doc.name,
        tags: doc.tags ?? [],
        image: await taskImage(engine.export()),
        text: visibleText(),
      };
      const chosen = await assistant.review(context);
      if (!chosen) return;
      proposal = null;
      const { name } = await assistant.run(chosen.context, chosen.client, {
        event: (event) => {
          if (event.type === "error") status(`${name}: ${event.message}`);
          else if (event.type === "tool") status(`${name}: ${event.title}…`);
          else if (event.type === "quota" && event.level !== "ok") status(event.text);
        },
        proposal: (event) => {
          if (event.targetId !== current()?.id) return;
          proposal = event;
          status("Sugestão pronta para revisar.");
          render();
        },
        end: () => render(),
      });
      status(`${name} está trabalhando…`);
      render();
    } catch (error) {
      toast(error.message, true);
      render();
    }
  };
  $("ai-stop").onclick = () => {
    assistant.stop();
    status("Tarefa interrompida.");
    render();
  };
  $("ai-discard").onclick = () => {
    proposal = null;
    status("Sugestão descartada.");
    render();
  };
  $("ai-apply").onclick = async () => {
    try {
      const doc = current();
      if (!proposal || proposal.targetId !== doc?.id)
        throw new Error("A sugestão era de outra captura.");
      const before = { name: doc.name, tags: doc.tags ?? [] };
      await apply({ name: proposal.proposal.title, tags: proposal.proposal.tags });
      undo = { targetId: doc.id, before };
      proposal = null;
      status("Sugestão aplicada.");
    } catch (error) {
      toast(error.message, true);
    }
    render();
  };
  $("ai-undo").onclick = async () => {
    try {
      if (undo?.targetId !== current()?.id) throw new Error("A captura mudou.");
      await apply(undo.before);
      undo = null;
      status("Sugestão desfeita.");
    } catch (error) {
      toast(error.message, true);
    }
    render();
  };
  return {
    /** A document change ends the task and drops proposals and undo of the previous one. */
    activate(doc) {
      if (proposal?.targetId !== doc?.id) proposal = null;
      if (undo?.targetId !== doc?.id) undo = null;
      if (assistant.stop("capture-details")) status("Tarefa interrompida ao trocar de captura.");
      panel.hidden = doc?.kind !== "image";
      render();
    },
  };
}
