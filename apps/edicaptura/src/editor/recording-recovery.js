export async function mountRecordingRecovery(api, prepareActivation, toast) {
  const entries = await api.recordRecoveries();
  if (!entries.length) return;
  const panel = document.createElement("section");
  panel.className = "recording-recovery";
  panel.setAttribute("aria-label", "Gravações recuperáveis");
  const title = document.createElement("h2");
  title.textContent = "Gravações interrompidas neste computador";
  panel.append(title);
  for (const entry of entries) {
    const row = document.createElement("div");
    const text = document.createElement("span");
    text.textContent =
      entry.error ||
      `${new Date(entry.created).toLocaleString("pt-BR")} · ${(entry.bytes / 1024 / 1024).toFixed(1)} MB · ${Math.floor(entry.durationMs / 1000)} s confirmados`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Recuperar na biblioteca original";
    button.disabled = entry.status === "damaged" || !entry.bytes;
    button.onclick = async () => {
      button.disabled = true;
      try {
        const activate = prepareActivation();
        const document = await api.recordRecover(entry.sessionId);
        await activate(document);
        row.remove();
        if (panel.children.length === 1) panel.remove();
        toast("Gravação recuperada. Confira o vídeo antes de exportar.");
      } catch (error) {
        button.disabled = false;
        toast(`${error.message} Os originais de recuperação permanecem no computador.`, true);
      }
    };
    row.append(text, button);
    panel.append(row);
  }
  document.querySelector(".main-actions").after(panel);
}
