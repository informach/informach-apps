globalThis.__chromaTestRun = (async () => {
  const results = [];
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
    results.push(message);
  };
  const until = async (predicate) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 15000) throw new Error("Timed out waiting for chroma UI");
      await new Promise((r) => setTimeout(r, 40));
    }
  };
  await until(() => window.__edifoto);
  const E = window.__edifoto;
  const button = (text) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#00ff00";
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = "#b47850";
  ctx.beginPath();
  ctx.arc(320, 220, 105, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#152040";
  ctx.fillRect(205, 315, 230, 165);
  E.useDoc.getState().load(E.ops.docFromImage(c, 640, 480, "Chroma — teste de recorte"));
  const original = E.useDoc.getState().doc.layers[0];
  E.ops.addMask(original.id);
  const mask = E.useDoc.getState().doc.layers[0].mask.bitmap;
  await until(() => button("Remover fundo"));
  button("Remover fundo").click();
  await until(() => button("Aplicar recorte") && !button("Aplicar recorte").disabled);
  assert(
    !!document.querySelector('dialog[aria-label="Remover fundo"]'),
    "dialog opens and worker completes",
  );
  assert(
    document.querySelector(".chroma-preview canvas").width === 640,
    "preview preserves original resolution",
  );
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true }));
  assert(!E.useUi.getState().newDocumentOpen, "new document shortcut blocked while refining");
  button("Cancelar").click();
  await until(() => !E.useUi.getState().chromaOpen);
  assert(
    E.useDoc.getState().doc.layers[0].bitmap === original.bitmap,
    "cancel preserves original pixels",
  );
  button("Remover fundo").click();
  await until(() => button("Aplicar recorte") && !button("Aplicar recorte").disabled);
  button("Aplicar recorte").click();
  await until(() => !E.useUi.getState().chromaOpen);
  const keyed = E.useDoc.getState().doc.layers[0];
  const data = E.bitmaps.requireBitmap(keyed.bitmap).ctx;
  assert(data.getImageData(0, 0, 1, 1).data[3] === 0, "background becomes transparent");
  assert(data.getImageData(320, 220, 1, 1).data[3] === 255, "subject remains opaque");
  assert(keyed.mask.bitmap === mask, "existing mask preserved");
  E.actions.undo();
  assert(
    E.useDoc.getState().doc.layers[0].bitmap === original.bitmap,
    "undo restores original bitmap",
  );
  E.actions.redo();
  assert(E.useDoc.getState().doc.layers[0].bitmap === keyed.bitmap, "redo restores keyed bitmap");
  const serialized = await E.files.serializeDocument(E.useDoc.getState().doc);
  const parsed = await E.files.parseDocument(serialized);
  assert(
    parsed.bitmaps.get(keyed.bitmap).getContext("2d").getImageData(0, 0, 1, 1).data[3] === 0,
    "project round trip preserves transparency",
  );
  E.actions.undo();
  button("Remover fundo").click();
  await until(() => button("Aplicar recorte") && !button("Aplicar recorte").disabled);
  const report = document.createElement("pre");
  report.id = "chroma-test-results";
  report.textContent = JSON.stringify({ passed: results.length, results });
  document.body.append(report);
  return { passed: results.length, results };
})();
