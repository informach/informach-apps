globalThis.__newDocumentTestRun = (async () => {
  const E = window.__edifoto,
    results = [],
    wait = () => new Promise((r) => setTimeout(r, 80));
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    results.push(label);
  };
  const original = E.useDoc.getState().doc;
  const button = (text) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const field = (selector, value) => {
    const el = document.querySelector(selector);
    Object.getOwnPropertyDescriptor(
      el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  };
  try {
    button("Arquivo").click();
    await wait();
    const menu = [...document.querySelectorAll(".menu-item")].find((b) =>
      b.textContent.startsWith("Novo"),
    );
    assert(!!menu, "Arquivo contains Novo");
    menu.click();
    await wait();
    assert(
      !!document.querySelector('[aria-labelledby="new-document-title"]'),
      "Novo opens document dialog",
    );
    button("Cancelar").click();
    await wait();
    assert(E.useDoc.getState().doc.id === original.id, "cancel preserves current document");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true }));
    await wait();
    assert(E.useUi.getState().newDocumentOpen, "Ctrl+N opens dialog");
    field("form input[maxlength]", "Novo teste");
    await wait();
    const numbers = document.querySelectorAll('form input[type="number"]');
    numbers[0].setAttribute("data-test", "new-width");
    numbers[1].setAttribute("data-test", "new-height");
    field('[data-test="new-width"]', "320");
    await wait();
    field('[data-test="new-height"]', "240");
    await wait();
    field("form select", "transparent");
    await wait();
    E.useDoc.setState({ dirty: true });
    button("Criar documento").click();
    await wait();
    assert(!!E.useUi.getState().confirm, "dirty document asks before replacement");
    E.useUi.getState().confirm.resolve(false);
    await wait();
    assert(
      E.useDoc.getState().doc.id === original.id && E.useUi.getState().newDocumentOpen,
      "declining discard preserves document and form",
    );
    button("Criar documento").click();
    await wait();
    E.useUi.getState().confirm.resolve(true);
    await wait();
    const s = E.useDoc.getState();
    assert(
      s.doc.name === "Novo teste" && s.doc.width === 320 && s.doc.height === 240,
      "creates requested name and dimensions",
    );
    assert(
      s.doc.layers.length === 1 && s.doc.layers[0].kind === "raster",
      "transparent document has editable raster layer",
    );
    assert(
      s.dirty && !s.filePath && !s.past.length && !s.future.length,
      "new document is unsaved with fresh history",
    );
    const c = E.compositor().renderToCanvas(s.doc);
    assert(
      c.getContext("2d").getImageData(10, 10, 1, 1).data[3] === 0,
      "transparent background renders transparent pixels",
    );
    E.useDoc.setState({ dirty: false });
    await E.actions.createDocument("Branco", 80, 60, "#ffffff");
    const white = E.compositor()
      .renderToCanvas(E.useDoc.getState().doc)
      .getContext("2d")
      .getImageData(10, 10, 1, 1).data;
    assert(white[0] === 255 && white[3] === 255, "white background renders opaque white");
    const id = E.useDoc.getState().doc.id;
    for (const [w, h] of [
      [0, 100],
      [1.5, 100],
      [8193, 100],
      [8192, 8192],
    ]) {
      let rejected = false;
      try {
        await E.actions.createDocument("Invalid", w, h, null);
      } catch {
        rejected = true;
      }
      assert(
        rejected && E.useDoc.getState().doc.id === id,
        "invalid dimensions rejected: " + w + "x" + h,
      );
    }
  } finally {
    E.useUi.setState({ newDocumentOpen: false, confirm: null });
    E.useDoc.getState().load(original);
  }
  return { passed: results.length, results };
})();
