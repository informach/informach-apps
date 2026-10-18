globalThis.__workspaceTestRun = (async () => {
  const until = async (fn) => {
    const deadline = performance.now() + 15000;
    while (!fn()) {
      if (performance.now() > deadline) throw new Error("Workspace check timed out");
      await new Promise(requestAnimationFrame);
    }
  };
  await until(() => window.__edifoto && document.querySelector(".home"));
  const E = window.__edifoto,
    D = E.useDoc,
    U = E.useUi,
    results = [];
  const assert = (value, label) => {
    if (!value) throw new Error(label);
    results.push(label);
  };
  assert(
    document.querySelectorAll(".template-card").length === 4,
    "four generic editable templates are available",
  );
  document.querySelector(".template-card").click();
  await until(() => D.getState().doc && document.querySelector(".viewport"));
  assert(
    D.getState().dirty && D.getState().doc.layers.filter((l) => l.kind === "text").length === 2,
    "template creates unsaved editable text and shapes",
  );
  assert(
    document.querySelectorAll(".tool").length < 15,
    "simple workspace starts with fewer visible tools",
  );
  document.querySelector('[aria-label="Mais ferramentas"]').click();
  await until(() => U.getState().advanced);
  assert(document.querySelectorAll(".tool").length >= 15, "advanced tools remain available");
  document.querySelector('[aria-label="Menos ferramentas"]').click();
  const base = E.compositor()
    .renderToCanvas(D.getState().doc, { before: true })
    .getContext("2d")
    .getImageData(10, 10, 1, 1).data;
  E.ops.editLayer(D.getState().doc.layers[0].id, { color: "#001122" });
  const before = E.compositor()
    .renderToCanvas(D.getState().doc, { before: true })
    .getContext("2d")
    .getImageData(10, 10, 1, 1).data;
  assert(
    Array.from(base).join() === Array.from(before).join(),
    "before comparison preserves original opening state",
  );
  E.ops.editLayer(D.getState().doc.layers[0].id, { color: "#f7f3ec" });
  const title = D.getState().doc.layers.find((l) => l.kind === "text" && l.name === "Título");
  D.getState().setActive(title.id);
  U.setState({ tab: "props" });
  await until(() => document.querySelector("textarea"));
  const textarea = document.querySelector("textarea");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
    textarea,
    "Uma mensagem que pode ser editada e reutilizada",
  );
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await until(() =>
    D.getState()
      .doc.layers.find((l) => l.id === title.id)
      .text.content.startsWith("Uma mensagem"),
  );
  assert(
    D.getState().doc.layers.find((l) => l.id === title.id).text.maxWidth > 0,
    "text is editable with automatic wrapping",
  );
  const parsed = await E.files.parseDocument(await E.files.serializeDocument(D.getState().doc));
  assert(
    parsed.doc.layers.find((l) => l.id === title.id).text.content.startsWith("Uma mensagem"),
    "template edits survive project roundtrip",
  );
  E.actions.exportDialog();
  await until(() => document.querySelector(".export-preview img"));
  assert(
    document.querySelector('dialog[aria-label="Exportar imagem"]'),
    "export opens with a visual preview",
  );
  const cancel = [...document.querySelectorAll("dialog button")].find(
    (b) => b.textContent.trim() === "Cancelar",
  );
  cancel.click();
  U.setState({ assistantOpen: true, tab: "layers" });
  await new Promise(requestAnimationFrame);
  E.actions.fit();
  await document.fonts.ready;
  return { passed: results.length, results };
})();
