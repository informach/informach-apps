import { CanvasEditor } from "./canvas.js";

/** Existing editor owns document activation/autosave; library owns bounded queries and selections. */
export function mountLibrary({
  api,
  card,
  toast,
  safe,
  persist,
  current,
  importResult,
  clearDocument,
  transitionWorkspace,
  refreshRecents,
}) {
  const $ = (id) => document.getElementById(id);
  const section = $("library-view");
  const controls = document.createElement("div");
  controls.className = "library-controls";
  controls.innerHTML = `<div class="library-filters"><label>Tipo<select id="library-kind"><option value="">Todos</option><option value="image">Imagens</option><option value="video">Vídeos</option><option value="damaged">Danificados</option></select></label><label><input id="library-favorite" type="checkbox"> Favoritos</label><label><input id="library-trash" type="checkbox"> Lixeira local</label><label>Tag<input id="library-tag" maxlength="60"></label><label>Coleção<input id="library-collection" maxlength="80"></label><label>App de origem<input id="library-source" maxlength="120"></label><label>De<input id="library-from" type="date"></label><label>Até<input id="library-to" type="date"></label></div><div class="library-bulk"><button type="button" id="library-select-page">Selecionar página</button><button type="button" id="library-clear">Limpar seleção</button><label>Ação<select id="library-operation"><option value="favorite">Favoritar</option><option value="unfavorite">Remover favorito</option><option value="duplicate">Duplicar projeto completo</option><option value="trash">Mover para lixeira</option><option value="restore">Restaurar da lixeira</option><option value="metadata">Aplicar tags/coleção</option></select></label><label>Tags (vírgulas)<input id="library-bulk-tags" maxlength="1000"></label><label>Coleção<input id="library-bulk-collection" maxlength="80"></label><button type="button" id="library-apply">Aplicar à seleção</button><button type="button" id="library-batch-export">Exportar seleção</button><label>Destino<select id="library-export-destination"><option value="-1">Escolher pasta…</option></select></label></div><div class="library-bulk"><button type="button" id="project-export">Projeto editável aberto → arquivo</button><button type="button" id="project-import">Importar projeto editável</button><button type="button" id="project-reveal">Mostrar projeto aberto no Explorer</button><button type="button" id="library-settings-open">Biblioteca e preferências</button><button type="button" id="library-refresh">Atualizar arquivos em disco</button></div><p id="library-page-status" role="status"></p>`;
  $("library-grid").before(controls);
  const navigation = document.createElement("nav");
  navigation.className = "library-pagination";
  navigation.setAttribute("aria-label", "Páginas da biblioteca");
  navigation.innerHTML = `<button type="button" id="library-previous">Anterior</button><button type="button" id="library-next">Próxima</button>`;
  section.append(navigation);
  const settings = document.createElement("dialog");
  settings.id = "library-settings";
  settings.innerHTML = `<form method="dialog"><h2>Biblioteca e preferências</h2><p>Biblioteca ativa: <output id="library-root"></output></p><p>Copiar ou restaurar exige pasta vazia. A biblioteca anterior permanece intacta. Backup inclui originais, objetos, lixeira e metadados danificados. Limite: 800 MB / 20.000 arquivos.</p><div class="library-bulk"><button type="button" id="library-root-reveal">Mostrar pasta no Explorer</button><button type="button" id="library-root-copy">Copiar e usar outra pasta</button><button type="button" id="library-root-open">Abrir biblioteca existente</button><button type="button" id="library-backup">Salvar backup integral</button><button type="button" id="library-restore">Restaurar em pasta vazia</button></div><label><input id="preference-tray" type="checkbox"> Ícone na bandeja enquanto o app está aberto</label><label><input id="preference-start" type="checkbox"> Iniciar com Windows (aplicativo instalado)</label><button type="button" id="preference-save">Guardar preferências</button><output id="library-operation-status" role="status"></output><h3>Destinos favoritos</h3><div id="favorite-destinations"></div><button type="button" id="destination-add">Adicionar pasta</button><p>PNG/JPEG/WebP importados do Snagit são imagens finais. SNAGX deve ser exportado no Snagit; seus objetos não são importados. Vídeos locais aceitam WebM e preservam o original. A biblioteca lê duração e miniatura. A importação aceita somente WebM; o editor exporta o intervalo em MP4 ou GIF. Compartilhe arquivos finais com navegador ou Office pela área de transferência ou pelo seletor de arquivos.</p><footer><button value="close">Fechar</button></footer></form>`;
  document.body.append(settings);
  let offset = 0,
    generation = 0,
    page = [],
    total = 0,
    selected = new Set(),
    busy = false;
  settings.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  settings.querySelector("form").addEventListener("submit", (event) => {
    if (busy) event.preventDefault();
  });
  const query = () => ({
    search: $("library-search").value,
    kind: $("library-kind").value,
    favorite: $("library-favorite").checked,
    trash: $("library-trash").checked,
    tag: $("library-tag").value,
    collection: $("library-collection").value,
    sourceApp: $("library-source").value,
    from: $("library-from").value,
    to: $("library-to").value,
    offset,
    limit: 60,
  });
  function updateSelection() {
    $("library-page-status").textContent =
      `${total ? offset + 1 : 0}–${Math.min(offset + page.length, total)} de ${total} · ${selected.size} selecionadas`;
    $("library-apply").disabled = busy || !selected.size;
    $("library-batch-export").disabled = busy || !selected.size;
    $("library-previous").disabled = busy || offset === 0;
    $("library-next").disabled = busy || offset + 60 >= total;
  }
  async function render(reset = false) {
    if (reset) {
      offset = 0;
      selected.clear();
    }
    const request = ++generation;
    $("library-page-status").textContent = "Carregando biblioteca…";
    let response;
    try {
      response = await api.list(query());
    } catch (error) {
      if (request === generation)
        $("library-page-status").textContent =
          "Falha ao consultar a biblioteca. Tente atualizar os arquivos em disco.";
      throw error;
    }
    if (request !== generation) return;
    // Old test bridges can return arrays; real IPC always returns a bounded page.
    const result = Array.isArray(response)
      ? { items: response.slice(offset, offset + 60), total: response.length }
      : response;
    if (offset && offset >= result.total) {
      offset = Math.max(0, Math.floor((result.total - 1) / 60) * 60);
      return render();
    }
    page = result.items;
    total = result.total;
    $("library-grid").replaceChildren();
    for (const entry of page) {
      const wrapper = document.createElement("article");
      wrapper.className = "library-item";
      const label = document.createElement("label"),
        checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", `Selecionar ${entry.name}`);
      checkbox.checked = selected.has(entry.id);
      checkbox.disabled = entry.kind === "damaged";
      checkbox.onchange = () => {
        if (checkbox.checked) selected.add(entry.id);
        else selected.delete(entry.id);
        updateSelection();
      };
      label.append(checkbox, " Selecionar");
      const details = document.createElement("small");
      details.className = "library-entry-details";
      details.textContent = [
        entry.favorite ? "★ Favorito" : "",
        ...(entry.tags || []),
        entry.collection,
        entry.sourceApp,
        entry.kind === "video"
          ? entry.media?.durationSeconds === undefined
            ? "WebM · metadados pendentes"
            : `${entry.media.durationSeconds.toFixed(1)} s`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const button = card(entry, true);
      if (entry.deletedAt) {
        button.onclick = () => toast("Restaure esta captura para abri-la.");
      }
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.textContent = "Mostrar no Explorer";
      reveal.setAttribute("aria-label", `Mostrar ${entry.name} no Explorer`);
      reveal.onclick = safe(() => api.libraryWorkflow({ action: "reveal", id: entry.id }));
      wrapper.append(label, button, details, reveal);
      $("library-grid").append(wrapper);
    }
    if (!page.length) {
      const empty = document.createElement("p");
      empty.textContent = "Nenhuma captura corresponde aos filtros.";
      $("library-grid").append(empty);
    }
    updateSelection();
  }
  for (const id of [
    "library-search",
    "library-kind",
    "library-favorite",
    "library-trash",
    "library-tag",
    "library-collection",
    "library-source",
    "library-from",
    "library-to",
  ])
    $(id).oninput = safe(() => render(true));
  $("library-previous").onclick = safe(() => {
    offset = Math.max(0, offset - 60);
    selected.clear();
    return render();
  });
  $("library-next").onclick = safe(() => {
    offset += 60;
    selected.clear();
    return render();
  });
  $("library-select-page").onclick = () => {
    selected = new Set(page.filter((entry) => entry.kind !== "damaged").map((entry) => entry.id));
    render().catch((error) => toast(error.message, true));
  };
  $("library-clear").onclick = safe(() => {
    selected.clear();
    return render();
  });
  async function locked(fn, persistBefore = true) {
    if (busy) return;
    busy = true;
    $("library-operation-status").textContent =
      "Operação em andamento. Aguarde a conclusão antes de fechar o aplicativo.";
    settings.setAttribute("aria-busy", "true");
    const controls = [...settings.querySelectorAll("button,input,select")].map((control) => [
      control,
      control.disabled,
    ]);
    for (const [control] of controls) control.disabled = true;
    updateSelection();
    try {
      if (persistBefore) await persist();
      return await fn();
    } finally {
      busy = false;
      $("library-operation-status").textContent = "";
      settings.removeAttribute("aria-busy");
      for (const [control, disabled] of controls) control.disabled = disabled;
      updateSelection();
    }
  }
  function resultMessage(result, label) {
    if (!result) {
      toast("Operação cancelada. Nenhuma alteração realizada.");
      return;
    }
    toast(
      `${label}: ${result.succeeded.length} concluídas.${result.failed.length ? ` ${result.failed.length} falharam: ${result.failed.map((failure) => failure.message).join("; ")}` : ""}`,
      !!result.failed.length,
    );
  }
  $("library-apply").onclick = safe(() =>
    locked(async () => {
      const operation = $("library-operation").value,
        ids = [...selected];
      const result = await api.libraryWorkflow({
        action: "bulk",
        ids,
        operation,
        ...(operation === "metadata"
          ? {
              tags: $("library-bulk-tags")
                .value.split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              collection: $("library-bulk-collection").value,
            }
          : {}),
      });
      if (operation === "trash" && result.succeeded.includes(current()?.id)) clearDocument();
      selected.clear();
      resultMessage(result, "Ações");
      await refreshRecents();
      await render();
    }),
  );
  $("library-batch-export").onclick = safe(() =>
    locked(async () => {
      const destination = await api.batchDestination(Number($("library-export-destination").value));
      if (!destination) {
        toast("Exportação em lote cancelada.");
        return;
      }
      const result = { succeeded: [], failed: [] };
      try {
        // Render and send one capture at a time; never accumulate a page of full-resolution images.
        for (const id of selected) {
          try {
            const doc = await api.read(id);
            let item = { id };
            if (doc.kind === "image") {
              const canvas = document.createElement("canvas"),
                output = new CanvasEditor(canvas, {
                  change() {},
                  selection() {},
                  text: async () => "",
                });
              output.activate(await output.prepare(doc));
              const url = output.export();
              item = {
                id,
                bytes: Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (character) =>
                  character.charCodeAt(0),
                ),
              };
            }
            const exported = await api.batchExport({ items: [item], destination });
            result.succeeded.push(...exported.succeeded);
            result.failed.push(...exported.failed);
          } catch (error) {
            result.failed.push({ id, message: error.message });
          }
        }
      } finally {
        await api.batchFinish(destination);
      }
      resultMessage(result, "Exportações");
    }),
  );
  $("project-export").onclick = safe(() =>
    locked(async () => {
      if (!current()) throw new Error("Abra um projeto para exportar.");
      const result = await api.libraryWorkflow({ action: "portable-export", id: current().id });
      toast(result ? `Projeto editável salvo: ${result}` : "Exportação cancelada.");
    }),
  );
  $("project-reveal").onclick = safe(async () => {
    if (!current()) throw new Error("Abra um projeto primeiro.");
    await api.libraryWorkflow({ action: "reveal", id: current().id });
  });
  $("project-import").onclick = safe(() =>
    importResult(() => api.libraryWorkflow({ action: "portable-import" })),
  );
  function showPreferences(prefs) {
    $("library-root").textContent = prefs.root;
    $("preference-tray").checked = prefs.tray;
    $("preference-start").checked = prefs.startWithWindows;
    $("favorite-destinations").replaceChildren();
    $("library-export-destination").replaceChildren(new Option("Escolher pasta…", "-1"));
    prefs.destinations.forEach((destination, index) => {
      $("library-export-destination").add(new Option(destination, String(index)));
      const row = document.createElement("div"),
        name = document.createElement("span"),
        remove = document.createElement("button");
      name.textContent = destination;
      remove.type = "button";
      remove.textContent = "Remover";
      remove.setAttribute("aria-label", `Remover destino ${destination}`);
      remove.onclick = safe(async () =>
        showPreferences(await api.libraryWorkflow({ action: "destination-remove", index })),
      );
      row.append(name, remove);
      $("favorite-destinations").append(row);
    });
  }
  const settingsOpen = safe(async () => {
    showPreferences(await api.libraryWorkflow({ action: "preferences" }));
    settings.showModal();
  });
  $("library-settings-open").onclick = settingsOpen;
  $("library-root-reveal").onclick = safe(() => api.libraryWorkflow({ action: "reveal-root" }));
  $("preference-save").onclick = safe(async () => {
    showPreferences(
      await api.libraryWorkflow({
        action: "preference",
        tray: $("preference-tray").checked,
        startWithWindows: $("preference-start").checked,
      }),
    );
    toast("Preferências guardadas.");
  });
  $("destination-add").onclick = safe(async () => {
    const result = await api.libraryWorkflow({ action: "destination-add" });
    if (result) showPreferences(result);
    else toast("Escolha de destino cancelada.");
  });
  $("library-backup").onclick = safe(() =>
    locked(async () => {
      const result = await api.libraryWorkflow({ action: "backup" });
      toast(result ? `Backup salvo: ${result}` : "Backup cancelado.");
    }),
  );
  for (const [id, action] of [
    ["library-root-copy", { action: "root", mode: "copy" }],
    ["library-root-open", { action: "root", mode: "open" }],
    ["library-restore", { action: "restore" }],
  ])
    $(id).onclick = safe(() =>
      locked(async () => {
        const result = await transitionWorkspace(action);
        if (!result) {
          toast("Troca de biblioteca cancelada.");
          return;
        }
        selected.clear();
        offset = 0;
        showPreferences(result);
        await refreshRecents();
        await render();
        toast("Biblioteca ativa alterada. A origem foi preservada.");
      }, false),
    );
  $("library-refresh").onclick = safe(() =>
    locked(async () => {
      await api.libraryWorkflow({ action: "refresh" });
      selected.clear();
      await refreshRecents();
      await render();
      toast("Índice atualizado a partir dos arquivos locais.");
    }),
  );
  if (typeof api.libraryWorkflow === "function")
    api
      .libraryWorkflow({ action: "preferences" })
      .then(showPreferences)
      .catch((error) => toast(error.message, true));
  return { render, settingsOpen };
}
