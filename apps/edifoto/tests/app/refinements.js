globalThis.__refinementsTestRun = (async () => {
  const until = async (fn) => {
    const deadline = performance.now() + 15000;
    while (!fn()) {
      if (performance.now() > deadline) throw new Error("Refinement check timed out");
      await new Promise(requestAnimationFrame);
    }
  };
  await until(() => window.__edifoto);
  const E = window.__edifoto,
    D = E.useDoc,
    U = E.useUi,
    results = [];
  const assert = (value, label) => {
    if (!value) throw new Error(label);
    results.push(label);
  };
  D.getState().load(E.ops.blankDoc(240, 160, "Example", null));
  let id = D.getState().activeId;
  E.ops.setTransform(id, { rotation: 32, basis: [1.4, 0, 0, 0.8], scale: 0.4 });
  E.layout.alignLayer(id, "right", 10);
  let box = E.layout.layerBounds(D.getState().doc.layers[0]);
  assert(Math.abs(box.x + box.w - 230) < 0.01, "alignment uses transformed bounds");
  E.layout.alignLayer(id, "middle");
  box = E.layout.layerBounds(D.getState().doc.layers[0]);
  assert(
    Math.abs(box.y + box.h / 2 - 80) < 0.01,
    "vertical centering handles rotation and nonuniform basis",
  );
  const style = E.styles.applyStyle("warm", 80);
  E.ops.setLayerProps(style, { name: "Custom name" });
  E.styles.applyStyle("cool", 40);
  assert(
    D.getState().doc.layers.filter((l) => l.role === "style").length === 1 &&
      D.getState().doc.layers.at(-1).opacity === 0.4,
    "style changes reuse one adjustable layer after renaming",
  );
  const parsed = await E.files.parseDocument(await E.files.serializeDocument(D.getState().doc));
  assert(parsed.doc.layers.at(-1).preset === "cool", "style metadata survives project roundtrip");
  const template = await import("/src/shared/templates.ts");
  D.getState().load(template.createImageTemplate("split"));
  const slot = D.getState().doc.layers.find((l) => l.role === "image-placeholder");
  const image = document.createElement("canvas");
  image.width = 200;
  image.height = 100;
  const ctx = image.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 200, 100);
  E.layout.replaceImageSlot(slot.id, image);
  let output = E.compositor().renderToCanvas(D.getState().doc),
    pixel = output.getContext("2d").getImageData(1380, 540, 1, 1).data;
  assert(pixel[0] > 240 && pixel[1] < 20, "template image slot accepts a photo");
  pixel = output.getContext("2d").getImageData(1900, 540, 1, 1).data;
  assert(pixel[1] > 200, "slot cover clips image to its editable frame");
  D.getState().undo();
  assert(
    D.getState().doc.layers.find((l) => l.id === slot.id).role === "image-placeholder",
    "slot replacement is undoable",
  );
  D.getState().load(E.ops.blankDoc(100, 100, "Selection", null));
  id = D.getState().activeId;
  E.selection.selectPolygon([
    { x: 20, y: 20 },
    { x: 80, y: 20 },
    { x: 80, y: 80 },
    { x: 20, y: 80 },
  ]);
  E.selection.refineSelection(0, 4);
  const selection = E.bitmaps.requireBitmap(U.getState().selection).ctx;
  const edge = selection.getImageData(20, 40, 1, 1).data[3];
  assert(
    edge > 0 && edge < 255 && selection.getImageData(50, 50, 1, 1).data[3] === 255,
    "selection feather softens only edges",
  );
  E.selection.selectionMask();
  assert(
    E.bitmaps.requireBitmap(D.getState().doc.layers[0].mask.bitmap).ctx.getImageData(20, 40, 1, 1)
      .data[0] === edge,
    "selection softness carries into mask",
  );
  D.getState().load(E.ops.blankDoc(100, 100, "Brush", null));
  id = D.getState().activeId;
  E.ops.setTransform(id, { basis: [2, 0, 0, 0.5] });
  U.setState({
    tool: "brush",
    paintTarget: "layer",
    fg: "#ff0000",
    selection: null,
    brush: { size: 20, hardness: 100, flow: 100, opacity: 100, mode: "source-over" },
  });
  assert(
    E.paint.beginStroke(50, 50, false) === null,
    "brush starts on anisotropically scaled layer",
  );
  E.paint.endStroke();
  output = E.compositor().renderToCanvas(D.getState().doc);
  const paint = output.getContext("2d");
  assert(
    paint.getImageData(58, 50, 1, 1).data[3] > 128 &&
      paint.getImageData(50, 58, 1, 1).data[3] > 128 &&
      paint.getImageData(64, 50, 1, 1).data[3] === 0 &&
      paint.getImageData(50, 64, 1, 1).data[3] === 0,
    "brush stays circular within raster sampling tolerance after anisotropic resize",
  );
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 200, 100);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(60, 20, 80, 60);
  D.getState().load(E.ops.docFromImage(image, 200, 100, "Uniform background"));
  id = D.getState().activeId;
  U.setState({ chromaOpen: true });
  await until(() => document.querySelector('dialog[aria-label="Remover fundo"]'));
  await until(() =>
    [...document.querySelectorAll("dialog button")].some(
      (button) => button.textContent.trim() === "Aplicar recorte" && !button.disabled,
    ),
  );
  assert(
    document.querySelector('[aria-label="Método de recorte"]').value === "uniform",
    "uniform background automatically selects suitable method",
  );
  [...document.querySelectorAll("dialog button")]
    .find((button) => button.textContent.trim() === "Aplicar recorte")
    .click();
  await until(() => !U.getState().chromaOpen);
  output = E.compositor().renderToCanvas(D.getState().doc);
  pixel = output.getContext("2d").getImageData(5, 5, 1, 1).data;
  assert(
    pixel[3] === 0 && output.getContext("2d").getImageData(90, 50, 1, 1).data[3] === 255,
    "white background preview applies with foreground preserved",
  );
  D.getState().undo();
  assert(
    E.compositor().renderToCanvas(D.getState().doc).getContext("2d").getImageData(5, 5, 1, 1)
      .data[3] === 255,
    "uniform cutout undo restores original",
  );
  const r = await E.runAiTool({
    id: "align-final",
    name: "align_layer",
    input: { layer_id: id, alignment: "center" },
    source: "assistant",
    documentId: D.getState().doc.id,
  });
  assert(r.ok, "assistant uses shared alignment operation");
  return { passed: results.length, results };
})();
