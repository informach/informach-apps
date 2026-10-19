import "./guides.css";
import { taskImage } from "./assistant.js";
import { CanvasEditor } from "./canvas.js";

const SAVE_DELAY = 600;
const STEP_IMAGE_BYTES = 25 * 1024 * 1024;
const dataUrlBytes = (url) =>
  Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));

/** Final image of a capture as the person sees it (masks, crop, transforms), never the original. */
async function sanitizedImage(render) {
  const url = render();
  const image = new Image();
  image.src = url;
  await image.decode();
  return { bytes: dataUrlBytes(url), url, width: image.naturalWidth, height: image.naturalHeight };
}
async function renderCapture(doc) {
  const canvas = document.createElement("canvas");
  const editor = new CanvasEditor(canvas, { change() {}, selection() {}, text: async () => "" });
  await editor.load(doc);
  try {
    return await sanitizedImage(() => editor.export());
  } finally {
    editor.clear();
    canvas.width = 0;
  }
}

/**
 * Simple guides (phase 7): steps made of sanitized capture images with title, description and
 * alternative text, reordered by buttons, saved automatically, exported as one HTML file or a
 * PDF. "Capturar passos" appends each new capture to the guide instead of opening it.
 */
export function mountGuides({ api, engine, current, toast, assistant }) {
  const dialog = document.createElement("dialog");
  dialog.id = "guide-dialog";
  dialog.setAttribute("aria-label", "Guias");
  dialog.innerHTML = `<header><h2>Guias</h2><button type="button" id="guide-close">Fechar</button></header><div class="guide-body"><aside><button type="button" id="guide-new" class="primary">Novo guia</button><label><input type="checkbox" id="guide-show-trash"> Lixeira</label><ul id="guide-list" aria-label="Guias salvos"></ul></aside><section id="guide-editor" hidden><label>Título<input id="guide-title" maxlength="120"></label><label>Descrição<textarea id="guide-description" maxlength="4000" rows="2"></textarea></label><label>Layout<select id="guide-layout"><option value="tutorial">Tutorial (um passo abaixo do outro)</option><option value="comparison">Comparação (dois por linha)</option></select></label><div class="guide-actions"><button type="button" id="guide-add-library">Adicionar da biblioteca</button><button type="button" id="guide-add-current">Adicionar captura aberta</button><button type="button" id="guide-session">Capturar passos</button><button type="button" id="guide-html">Exportar HTML</button><button type="button" id="guide-pdf">Exportar PDF</button><button type="button" id="guide-trash">Mover para a lixeira</button></div><div class="guide-actions"><button type="button" id="guide-ai">Sugerir textos com o assistente</button><button type="button" id="guide-ai-stop" hidden>Parar assistente</button><button type="button" id="guide-ai-apply" hidden class="primary">Aplicar textos sugeridos</button><button type="button" id="guide-ai-discard" hidden>Descartar sugestão</button><button type="button" id="guide-ai-undo" hidden>Desfazer textos sugeridos</button></div><div id="guide-ai-preview" hidden></div><div id="guide-picker" hidden><label>Buscar<input id="guide-picker-search" type="search"></label><ul id="guide-picker-list" aria-label="Capturas da biblioteca"></ul><button type="button" id="guide-picker-add" class="primary">Adicionar selecionadas</button><button type="button" id="guide-picker-cancel">Cancelar</button></div><p id="guide-status" role="status"></p><ol id="guide-steps" aria-label="Passos do guia"></ol><p class="muted">Cada passo guarda a imagem final da captura, com máscaras e recorte. O original não entra no guia.</p></section></div>`;
  document.body.append(dialog);
  const banner = document.createElement("div");
  banner.id = "guide-banner";
  banner.hidden = true;
  banner.setAttribute("role", "status");
  banner.innerHTML = `<span id="guide-banner-text"></span><button type="button" id="guide-banner-done">Concluir passos</button>`;
  document.body.append(banner);
  const opener = document.createElement("button");
  opener.type = "button";
  opener.id = "guides";
  opener.textContent = "Guias";
  document.querySelector(".main-actions")?.append(opener);
  const $ = (id) => document.getElementById(id);
  let guide = null,
    images = new Map(),
    pending = new Map(),
    saveTimer = null,
    saving = Promise.resolve(),
    session = null,
    suggestion = null,
    undoTexts = null;
  const safe = (action) => async () => {
    try {
      await action();
    } catch (error) {
      toast(error.message, true);
    }
  };
  const status = (text) => {
    $("guide-status").textContent = text;
  };
  async function refreshList() {
    const trash = $("guide-show-trash").checked;
    const list = (await api.guideList()).filter((item) => !!item.deletedAt === trash);
    $("guide-list").replaceChildren(
      ...list.map((item) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${item.title} · ${item.steps} passo(s)`;
        button.setAttribute("aria-current", String(item.id === guide?.id));
        button.onclick = safe(() => openGuide(item.id));
        li.append(button);
        return li;
      }),
    );
    if (!list.length) $("guide-list").textContent = trash ? "Lixeira vazia." : "Nenhum guia ainda.";
  }
  function payload() {
    return {
      guide: {
        id: guide.id,
        title: guide.title.trim() || "Guia sem título",
        description: guide.description,
        layout: guide.layout,
        steps: guide.steps,
      },
      assets: [...pending].map(([id, bytes]) => ({ id, bytes })),
    };
  }
  /** Saves now; each save sends only the images not yet written. */
  function save() {
    clearTimeout(saveTimer);
    if (!guide) return saving;
    const sent = payload();
    saving = saving
      .catch(() => undefined)
      .then(async () => {
        status("Salvando…");
        const saved = await api.guideSave(sent);
        for (const asset of sent.assets) pending.delete(asset.id);
        if (guide && (!guide.id || guide.id === saved.id)) {
          guide.id = saved.id;
          guide.updated = saved.updated;
          guide.deletedAt = saved.deletedAt;
        }
        status("Guia salvo neste computador.");
        await refreshList();
      })
      .catch((error) => {
        status(`Não salvo: ${error.message} As alterações continuam abertas; tente de novo.`);
        throw error;
      });
    return saving;
  }
  function changed() {
    clearTimeout(saveTimer);
    status("Alterações pendentes…");
    saveTimer = setTimeout(() => save().catch(() => undefined), SAVE_DELAY);
  }
  function renderSteps() {
    $("guide-editor").hidden = !guide;
    if (!guide) return;
    $("guide-title").value = guide.title;
    $("guide-description").value = guide.description;
    $("guide-layout").value = guide.layout;
    $("guide-trash").textContent = guide.deletedAt ? "Restaurar guia" : "Mover para a lixeira";
    const empty = !guide.steps.length;
    $("guide-html").disabled = empty || !guide.id;
    $("guide-pdf").disabled = empty || !guide.id;
    renderAi();
    $("guide-steps").replaceChildren(
      ...guide.steps.map((step, index) => {
        const li = document.createElement("li");
        li.className = "guide-step";
        const image = document.createElement("img");
        image.src = images.get(step.assetId) ?? "";
        image.alt = step.alt || step.title || `Passo ${index + 1}`;
        const fields = document.createElement("div");
        for (const [key, label, multiline] of [
          ["title", "Título do passo", false],
          ["description", "Descrição", true],
          ["alt", "Texto alternativo da imagem", false],
        ]) {
          const wrap = document.createElement("label");
          const input = document.createElement(multiline ? "textarea" : "input");
          input.value = step[key];
          input.maxLength = key === "alt" ? 500 : key === "title" ? 200 : 4000;
          input.oninput = () => {
            step[key] = input.value;
            changed();
          };
          wrap.append(`${label} `, input);
          fields.append(wrap);
        }
        const actions = document.createElement("div");
        actions.className = "guide-step-actions";
        for (const [label, move] of [
          ["Subir", -1],
          ["Descer", 1],
        ]) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.setAttribute("aria-label", `${label} passo ${index + 1}`);
          button.disabled = index + move < 0 || index + move >= guide.steps.length;
          button.onclick = () => {
            const [item] = guide.steps.splice(index, 1);
            guide.steps.splice(index + move, 0, item);
            renderSteps();
            changed();
            // Keep the keyboard on the moved step: its same button, or the other one at an end.
            const at = index + move + 1;
            const next =
              document.querySelector(`[aria-label="${label} passo ${at}"]:not(:disabled)`) ??
              document.querySelector(`#guide-steps li:nth-child(${at}) .guide-step-actions button`);
            next?.focus();
          };
          actions.append(button);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remover";
        remove.setAttribute("aria-label", `Remover passo ${index + 1}`);
        remove.onclick = () => {
          const [removed] = guide.steps.splice(index, 1);
          renderSteps();
          changed();
          toast(`Passo removido: ${removed.title || `passo ${index + 1}`}.`);
        };
        actions.append(remove);
        const number = document.createElement("strong");
        number.textContent = String(index + 1);
        li.append(number, image, fields, actions);
        return li;
      }),
    );
  }
  /** Leaves the open guide: its task ends, and unsaved changes block the switch instead of being lost. */
  async function leaveGuide() {
    assistant?.stop("guide-texts");
    suggestion = null;
    await save();
  }
  async function openGuide(id) {
    await leaveGuide();
    const { guide: loaded, images: stored } = await api.guideRead(id);
    guide = structuredClone(loaded);
    images = new Map(
      Object.entries(stored).map(([assetId, base64]) => [
        assetId,
        `data:image/png;base64,${base64}`,
      ]),
    );
    pending = new Map();
    renderSteps();
    status(guide.deletedAt ? "Guia na lixeira." : "");
    await refreshList();
  }
  /** Appends sanitized images as steps; the alternative text starts empty for the person to write. */
  async function addSteps(entries) {
    if (guide.steps.length + entries.length > 200)
      throw new Error("Limite de 200 passos atingido.");
    // Checked before anything is added: a step the store would refuse never enters the guide.
    if (entries.some((entry) => entry.bytes.byteLength > STEP_IMAGE_BYTES))
      throw new Error(
        "Imagem de passo maior que 25 MB. Recorte a captura ou adicione partes dela.",
      );
    const before = guide.steps.length;
    const added = [];
    for (const entry of entries) {
      const assetId = crypto.randomUUID();
      images.set(assetId, entry.url);
      pending.set(assetId, entry.bytes);
      added.push(assetId);
      guide.steps.push({
        id: crypto.randomUUID(),
        assetId,
        title: entry.title ?? "",
        description: "",
        alt: "",
        width: entry.width,
        height: entry.height,
        ...(entry.sourceId ? { sourceId: entry.sourceId } : {}),
      });
    }
    renderSteps();
    try {
      await save();
    } catch (error) {
      // The guide goes back to what was saved; nothing half-added stays to block later saves.
      guide.steps.splice(before);
      for (const assetId of added) {
        pending.delete(assetId);
        images.delete(assetId);
      }
      renderSteps();
      throw error;
    }
  }
  async function addFromLibrary(ids) {
    const added = [];
    for (const id of ids) {
      const doc = await api.read(id);
      if (doc.kind !== "image") continue;
      added.push({ ...(await renderCapture(doc)), sourceId: doc.id, title: doc.name });
    }
    await addSteps(added);
    status(`${added.length} passo(s) adicionado(s).`);
  }
  async function showPicker() {
    $("guide-picker").hidden = false;
    const result = await api.list({
      kind: "image",
      search: $("guide-picker-search").value,
      limit: 60,
    });
    $("guide-picker-list").replaceChildren(
      ...result.items.map((item) => {
        const li = document.createElement("li");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = item.id;
        label.append(box, ` ${item.name}`);
        li.append(label);
        return li;
      }),
    );
  }
  function renderBanner() {
    banner.hidden = !session;
    if (session)
      $("guide-banner-text").textContent =
        `Capturando passos para “${session.title}” · ${session.count} adicionado(s)`;
  }
  opener.onclick = safe(async () => {
    dialog.showModal();
    await refreshList();
    renderSteps();
  });
  $("guide-close").onclick = safe(async () => {
    await save().catch(() => undefined);
    dialog.close();
  });
  dialog.addEventListener("cancel", () => {
    void save().catch(() => undefined);
  });
  $("guide-show-trash").onchange = safe(refreshList);
  $("guide-new").onclick = safe(async () => {
    await leaveGuide();
    guide = { id: undefined, title: "Novo guia", description: "", layout: "tutorial", steps: [] };
    images = new Map();
    pending = new Map();
    renderSteps();
    await save();
    $("guide-title").focus();
    $("guide-title").select();
  });
  $("guide-title").oninput = () => {
    guide.title = $("guide-title").value;
    changed();
  };
  $("guide-description").oninput = () => {
    guide.description = $("guide-description").value;
    changed();
  };
  $("guide-layout").onchange = () => {
    guide.layout = $("guide-layout").value;
    changed();
  };
  $("guide-add-library").onclick = safe(showPicker);
  $("guide-picker-search").oninput = safe(showPicker);
  $("guide-picker-cancel").onclick = () => {
    $("guide-picker").hidden = true;
  };
  $("guide-picker-add").onclick = safe(async () => {
    const ids = [...$("guide-picker-list").querySelectorAll("input:checked")].map(
      (box) => box.value,
    );
    if (!ids.length) throw new Error("Selecione ao menos uma captura.");
    $("guide-picker").hidden = true;
    await addFromLibrary(ids);
  });
  $("guide-add-current").onclick = safe(async () => {
    const doc = current();
    if (doc?.kind !== "image" || !engine.image) throw new Error("Abra uma captura de imagem.");
    await addSteps([
      { ...(await sanitizedImage(() => engine.export())), sourceId: doc.id, title: doc.name },
    ]);
    status("Captura aberta adicionada como passo.");
  });
  $("guide-session").onclick = safe(async () => {
    await save();
    session = { id: guide.id, title: guide.title, count: 0 };
    dialog.close();
    renderBanner();
    toast("Use Capturar ou Print Screen. Cada captura nova entra como passo deste guia.");
  });
  $("guide-banner-done").onclick = safe(async () => {
    const id = session?.id;
    session = null;
    renderBanner();
    dialog.showModal();
    if (id) await openGuide(id);
  });
  $("guide-trash").onclick = safe(async () => {
    await leaveGuide();
    const updated = await api.guideTrash({ id: guide.id, deleted: !guide.deletedAt });
    guide.deletedAt = updated.deletedAt;
    renderSteps();
    await refreshList();
    status(guide.deletedAt ? "Guia na lixeira; restaure quando quiser." : "Guia restaurado.");
  });
  for (const format of ["html", "pdf"])
    $(`guide-${format}`).onclick = safe(async () => {
      await save();
      status(format === "pdf" ? "Gerando PDF…" : "Gerando HTML…");
      const file = await api.guideExport({ id: guide.id, format });
      status(file ? `Exportado: ${file}` : "Exportação cancelada.");
    });
  // The assistant (phase 8): titles, descriptions and alternative texts for the steps, reviewed
  // before sending and applied, or not, by the person; one undo restores the previous texts.
  function renderAi() {
    const busy = !!assistant?.busy("guide-texts");
    $("guide-ai").disabled = !assistant || !guide?.id || !guide.steps.length || busy;
    $("guide-ai-stop").hidden = !busy;
    const fits = suggestion && suggestion.targetId === guide?.id;
    $("guide-ai-apply").hidden = !fits;
    $("guide-ai-discard").hidden = !fits;
    $("guide-ai-preview").hidden = !fits;
    $("guide-ai-undo").hidden = !(undoTexts && undoTexts.targetId === guide?.id);
    if (!fits) return;
    const byId = new Map(guide.steps.map((step, index) => [step.id, index + 1]));
    $("guide-ai-preview").replaceChildren(
      ...suggestion.proposal.steps.map((step) => {
        const item = document.createElement("p");
        item.textContent = `Passo ${byId.get(step.stepId) ?? "?"}: “${step.title}” — ${step.description} [alt: ${step.alt}]`;
        return item;
      }),
    );
  }
  $("guide-ai").onclick = safe(async () => {
    await save();
    if (guide.steps.length > 20) throw new Error("O assistente recebe até 20 passos por vez.");
    const context = {
      task: "guide-texts",
      targetId: guide.id,
      title: guide.title,
      steps: await Promise.all(
        guide.steps.map(async (step) => ({
          stepId: step.id,
          title: step.title,
          description: step.description,
          alt: step.alt,
          image: await taskImage(images.get(step.assetId)),
        })),
      ),
    };
    const chosen = await assistant.review(context);
    if (!chosen) return;
    suggestion = null;
    const { name } = await assistant.run(chosen.context, chosen.client, {
      event: (event) => {
        if (event.type === "error") status(`${name}: ${event.message}`);
        else if (event.type === "tool") status(`${name}: ${event.title}…`);
      },
      proposal: (event) => {
        suggestion = event;
        status("Textos sugeridos prontos para revisar.");
        renderAi();
      },
      end: () => renderAi(),
    });
    status(`${name} está trabalhando…`);
    renderAi();
  });
  $("guide-ai-stop").onclick = () => {
    assistant.stop("guide-texts");
    status("Assistente interrompido.");
    renderAi();
  };
  $("guide-ai-discard").onclick = () => {
    suggestion = null;
    renderAi();
  };
  $("guide-ai-apply").onclick = () => {
    if (suggestion?.targetId !== guide?.id) return;
    const before = guide.steps.map(({ id, title, description, alt }) => ({
      id,
      title,
      description,
      alt,
    }));
    let applied = 0;
    for (const proposed of suggestion.proposal.steps) {
      const step = guide.steps.find((item) => item.id === proposed.stepId);
      if (!step) continue;
      step.title = proposed.title;
      step.description = proposed.description;
      step.alt = proposed.alt;
      applied++;
    }
    undoTexts = { targetId: guide.id, before };
    suggestion = null;
    renderSteps();
    changed();
    toast(`${applied} passo(s) atualizado(s). “Desfazer textos sugeridos” volta ao que era.`);
  };
  $("guide-ai-undo").onclick = () => {
    if (undoTexts?.targetId !== guide?.id) return;
    for (const previous of undoTexts.before) {
      const step = guide.steps.find((item) => item.id === previous.id);
      if (step) Object.assign(step, previous);
    }
    undoTexts = null;
    renderSteps();
    changed();
  };
  return {
    /**
     * During "Capturar passos", a new image capture becomes the next step of the guide and the
     * editor stays where it was. Returns true when it took the capture.
     */
    async capture(doc) {
      if (!session || doc?.kind !== "image") return false;
      const target = session;
      const full = await api.read(doc.id);
      const image = await renderCapture(full);
      if (session !== target) return false;
      if (guide?.id !== target.id) {
        const { guide: loaded, images: stored } = await api.guideRead(target.id);
        guide = structuredClone(loaded);
        images = new Map(
          Object.entries(stored).map(([assetId, base64]) => [
            assetId,
            `data:image/png;base64,${base64}`,
          ]),
        );
        pending = new Map();
      }
      await addSteps([{ ...image, sourceId: doc.id, title: "" }]);
      target.count++;
      renderBanner();
      toast(`Passo ${guide.steps.length} adicionado ao guia.`);
      return true;
    },
    flush: () => save(),
  };
}
