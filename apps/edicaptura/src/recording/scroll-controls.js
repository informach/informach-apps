export function setupScrollControls(api, error) {
  const $ = (id) => document.getElementById(id);
  let current,
    editing = false,
    previewKey = "",
    generation = 0;
  const key = (state) => JSON.stringify([state.count, state.axis, state.margins, state.cuts]);
  async function action(run) {
    try {
      error("");
      return await run();
    } catch (e) {
      error(e);
      return null;
    }
  }
  async function review(input) {
    if (editing) return;
    const intent = ++generation;
    editing = true;
    if (current) render(current);
    const result = await action(() => api.scrollReview(input));
    if (intent !== generation) return;
    editing = false;
    if (result) {
      render(result);
      previewKey = key(result);
      $("scroll-image").src = result.preview;
      const markers = $("scroll-markers");
      markers.replaceChildren();
      const vertical = result.axis === "vertical";
      const extent = vertical
        ? result.height - result.margins.top - result.margins.bottom
        : result.width - result.margins.left - result.margins.right;
      let boundary = extent;
      for (let i = 1; i < result.seams.length; i++) {
        const marker = document.createElement("span");
        marker.className = `scroll-marker ${vertical ? "vertical" : "horizontal"}`;
        marker.style[vertical ? "top" : "left"] =
          `${(100 * boundary) / (vertical ? result.dimensions.height : result.dimensions.width)}%`;
        marker.title = `Emenda ${i} · ${result.cuts[i]} px · ${Math.round(result.seams[i].confidence * 100)}%`;
        marker.textContent = String(i);
        markers.append(marker);
        boundary += extent - result.cuts[i];
      }
      $("scroll-figure").hidden = false;
    } else if (current) render(current);
  }
  $("scroll-configure").onclick = () =>
    review({
      op: "configure",
      axis: $("scroll-axis").value,
      margins: Object.fromEntries(
        ["top", "bottom", "left", "right"].map((side) => [side, Number($("crop-" + side).value)]),
      ),
    });
  $("scroll-preview").onclick = () => review({ op: "preview" });
  $("scroll-undo").onclick = () => review({ op: "undo" });
  function invalidate() {
    generation++;
    editing = false;
  }
  $("scroll-pause").onclick = () => {
    invalidate();
    return action(() => api.scrollPause());
  };
  $("cancel").addEventListener("click", invalidate);
  $("scroll-assist").onclick = () => action(() => api.scrollAssist());
  $("scroll-targets").onclick = async () => {
    const sources = await action(() => api.scrollTargets());
    $("scroll-target").replaceChildren(new Option("Escolha uma janela", ""));
    for (const source of sources || [])
      $("scroll-target").append(new Option(source.name, source.token));
    if (sources?.length === 0) error("Nenhuma janela contém toda a área móvel. Ajuste a seleção.");
  };
  $("scroll-auto").onclick = () =>
    action(() =>
      api.scrollAuto({
        token: $("scroll-target").value,
        axis: current?.axis || "vertical",
        authorized: true,
        maxSteps: Number($("scroll-limit").value),
      }),
    );
  function render(state) {
    current = state;
    if (!state.seams) return;
    if (key(state) !== previewKey) {
      $("scroll-figure").hidden = true;
      $("scroll-image").removeAttribute("src");
    }
    $("scroll-progress").textContent = state.waitingFocus
      ? "Ative a janela escolhida: a rolagem começará quando estiver ativa (até 30 s). Parar cancela."
      : state.automatic
        ? `Automático · ${state.steps} passos · estabilizando a imagem`
        : state.paused
          ? "Pausado · trechos preservados"
          : "Assistido · role e aguarde a confirmação";
    $("scroll-warning").textContent = state.warning || "";
    $("scroll-budget").textContent =
      `${state.dimensions.width} × ${state.dimensions.height} px · ${(state.bytes / 1048576).toFixed(1)} / 512 MiB estimados`;
    $("scroll-undo").disabled = !state.canUndo || editing;
    $("scroll-configure").disabled =
      editing || !!state.automatic || !!state.waitingFocus || !!state.busy;
    $("scroll-auto").disabled =
      editing || !!state.automatic || !!state.waitingFocus || !!state.busy;
    $("scroll-preview").disabled = editing || !!state.busy;
    $("next").disabled = editing || !!state.busy;
    $("finish").disabled = editing || !!state.busy;
    const list = $("scroll-seams");
    list.replaceChildren();
    state.seams.forEach((seam, index) => {
      const row = document.createElement("div");
      row.className = "scroll-seam";
      const label = document.createElement("span");
      label.textContent =
        index === 0
          ? "Trecho 1 · início"
          : `Emenda ${index} · ${Math.round(seam.confidence * 100)}% confiança · ${seam.automatic ? "automática" : "manual"}`;
      row.append(label);
      if (index) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = String(
          (state.axis === "horizontal"
            ? state.width - state.margins.left - state.margins.right
            : state.height - state.margins.top - state.margins.bottom) - 1,
        );
        input.value = String(state.cuts[index]);
        input.setAttribute("aria-label", `Corte da emenda ${index}`);
        const apply = document.createElement("button");
        apply.type = "button";
        apply.textContent = "Aplicar corte";
        apply.disabled = editing || !!state.busy;
        apply.onclick = () => review({ op: "cut", index, overlap: Number(input.value) });
        row.append(input, apply);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = `Remover trecho ${index + 1}`;
      remove.disabled = editing || !!state.busy || state.seams.length < 2;
      remove.onclick = () => review({ op: "remove", index });
      row.append(remove);
      if (seam.warning) {
        const warning = document.createElement("small");
        warning.textContent = seam.warning;
        row.append(warning);
      }
      list.append(row);
    });
  }
  return { render };
}
