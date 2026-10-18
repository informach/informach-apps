const $ = (id) => document.getElementById(id);
export function photoOptions() {
  const value = $("photo-precision").value;
  const precision =
    value === "free"
      ? { kind: "free" }
      : value === "fixed"
        ? {
            kind: "fixed",
            width: Number($("photo-fixed-width").value),
            height: Number($("photo-fixed-height").value),
          }
        : {
            kind: "ratio",
            width: Number(value.split(":")[0]),
            height: Number(value.split(":")[1]),
          };
  return {
    delay: Number($("photo-delay").value),
    cursor: $("photo-cursor").checked,
    destination: $("photo-destination").value,
    timing: $("photo-timing").value,
    precision,
  };
}
function applyOptions(options) {
  $("photo-delay").value = options.delay;
  $("photo-cursor").checked = options.cursor;
  $("photo-destination").value = options.destination;
  $("photo-timing").value = options.timing;
  const p = options.precision;
  $("photo-precision").value = p.kind === "ratio" ? `${p.width}:${p.height}` : p.kind;
  if (p.kind === "fixed") {
    $("photo-fixed-width").value = p.width;
    $("photo-fixed-height").value = p.height;
  }
  $("photo-fixed").hidden = p.kind !== "fixed";
}
export function installPhotoPresets({ api, persist, dialog, safe }) {
  let profile;
  const clean = (p) => {
    const { regionValid, ...value } = p;
    return value;
  };
  function render(next, selected = "") {
    profile = next;
    $("photo-preset-list").replaceChildren(new Option("Novo preset", ""));
    for (const p of profile.presets)
      $("photo-preset-list").append(
        new Option(
          `${p.name}${p.regionValid === false ? " · região inválida" : ""}${p.shortcut ? " · " + p.shortcut : ""}`,
          p.id,
        ),
      );
    $("photo-preset-list").value = selected;
    $("photo-repeat").disabled = !profile.lastValid;
    $("photo-preset-feedback").textContent = profile.shortcutErrors.join(" · ");
  }
  const load = async () => {
    render(await api.photoPreferences());
    applyOptions(profile.defaults);
  };
  const update = async (presets, defaults = profile.defaults, selected = "") => {
    render(await api.photoPreferencesSave({ defaults, presets: presets.map(clean) }), selected);
    $("photo-preset-feedback").textContent = "Preferências salvas.";
  };
  const act = (fn) =>
    safe(async () => {
      try {
        await fn();
      } catch (error) {
        $("photo-preset-feedback").textContent = error.message;
        throw error;
      }
    });
  $("photo-precision").onchange = () => {
    $("photo-fixed").hidden = $("photo-precision").value !== "fixed";
  };
  $("photo-defaults-save").onclick = act(async () => {
    await update(profile.presets, photoOptions());
  });
  $("photo-preset-list").onchange = () => {
    const p = profile.presets.find((p) => p.id === $("photo-preset-list").value);
    $("photo-preset-name").value = p?.name ?? "";
    $("photo-preset-shortcut").value = p?.shortcut ?? "";
    $("photo-preset-mode").value = p?.mode ?? "region";
    $("photo-preset-region").checked = !!p?.region;
    if (p) applyOptions(p.options);
  };
  $("photo-preset-save").onclick = act(async () => {
    const id = $("photo-preset-list").value || crypto.randomUUID(),
      mode = $("photo-preset-mode").value;
    const previous = profile.presets.find((p) => p.id === id);
    let region;
    if ($("photo-preset-region").checked) {
      if (!["region", "region-all"].includes(mode))
        throw new Error("Escolha um modo de região para guardar coordenadas.");
      region = previous?.region ?? profile.last;
      if (!region) throw new Error("Confirme uma região primeiro.");
      if (previous?.region ? previous.regionValid === false : !profile.lastValid)
        throw new Error("Selecione uma região na topologia atual primeiro.");
    }
    const preset = {
      id,
      name: $("photo-preset-name").value,
      mode,
      options: photoOptions(),
      shortcut: $("photo-preset-shortcut").value,
      ...(region ? { region } : {}),
    };
    await update([...profile.presets.filter((p) => p.id !== id), preset], profile.defaults, id);
  });
  $("photo-preset-delete").onclick = act(async () => {
    const id = $("photo-preset-list").value;
    if (!id) throw new Error("Escolha um preset.");
    await update(profile.presets.filter((p) => p.id !== id));
    $("photo-preset-list").dispatchEvent(new Event("change"));
  });
  // The callback must forward the ID; keyboard shortcuts use the same save barrier as buttons.
  const runPreset = safe(async (id) => {
    try {
      const current = await persist();
      const result = await api.photoPreset(id);
      if (!current()) return;
      if (result?.chooseSource) {
        await load();
        if (!current()) return;
        applyOptions(result.options);
        if (!dialog.open) dialog.showModal();
        $("photo-refresh").click();
        $("photo-preset-feedback").textContent =
          "Escolha uma janela ou controle atual para este preset.";
      }
    } catch (error) {
      $("photo-preset-feedback").textContent = error.message;
      throw error;
    }
  });
  $("photo-preset-run").onclick = () => runPreset($("photo-preset-list").value);
  api.onPhotoPreset?.(runPreset);
  $("photo-repeat").onclick = act(async () => {
    await persist();
    await api.photoRepeat();
  });
  return { load };
}
