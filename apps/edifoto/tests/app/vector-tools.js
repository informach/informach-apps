globalThis.__testRun = (async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 80 && !window.__edifoto; i++) await wait(100);
  const E = window.__edifoto,
    results = [];
  const assert = (ok, name) => {
    if (!ok) throw new Error(name);
    results.push(name);
  };
  E.useDoc.getState().load(E.ops.blankDoc(640, 420, "Teste vetorial", "#25252b"));
  await wait(300);
  const id = E.vector.addVector(
    {
      shape: "rectangle",
      width: 180,
      height: 100,
      radius: 18,
      fillColor: "#ff7a45",
      strokeColor: "#ffffff",
    },
    { x: 220, y: 170 },
  );
  await wait(150);
  const c = E.compositor().renderToCanvas(E.useDoc.getState().doc),
    px = c.getContext("2d").getImageData(220, 170, 1, 1).data;
  assert(px[0] > 240 && px[1] > 90 && px[1] < 140, "vector renders in GPU composite");
  E.vector.editVector(id, { shape: "star", sides: 6 });
  E.useDoc.getState().undo();
  assert(E.useDoc.getState().doc.layers.at(-1).vector.shape === "rectangle", "undo vector changes");
  E.useDoc.getState().redo();
  assert(E.useDoc.getState().doc.layers.at(-1).vector.shape === "star", "redo vector changes");
  const bytes = await E.files.serializeDocument(E.useDoc.getState().doc),
    parsed = await E.files.parseDocument(bytes);
  assert(parsed.doc.layers.at(-1).vector.shape === "star", "save/reopen retains vector properties");
  const vp = document.querySelector(".viewport"),
    rect = vp.getBoundingClientRect();
  const ev = async (type, x, y, extra = {}) => {
    vp.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        pointerId: 1,
        ...extra,
      }),
    );
    await wait(40);
  };
  E.useUi.getState().setTool("shape");
  await wait(50);
  const before = E.useDoc.getState().doc.layers.length;
  await ev("pointerdown", 100, 100);
  await ev("pointermove", 210, 160);
  await ev("pointerup", 210, 160);
  assert(E.useDoc.getState().doc.layers.length === before + 1, "pointer drag creates shape layer");
  E.useUi.getState().setTool("pen");
  await wait(50);
  await ev("pointerdown", 220, 180);
  await ev("pointerup", 220, 180);
  await ev("pointerdown", 320, 210);
  await ev("pointermove", 350, 170);
  await ev("pointerup", 350, 170);
  await ev("pointerdown", 430, 260);
  await ev("pointerup", 430, 260);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await wait(100);
  const pen = E.useDoc.getState().doc.layers.at(-1);
  assert(
    pen.vector.shape === "path" && pen.vector.points.length === 3 && pen.vector.points[1].outgoing,
    "pen points and Bézier handles created with pointer",
  );
  E.vector.editVector(pen.id, { closed: true });
  E.selection.vectorSelection(E.useDoc.getState().doc.layers.at(-1));
  assert(!!E.useUi.getState().selection, "path to selection");
  E.selection.selectionMask(id);
  assert(!!E.useDoc.getState().doc.layers.find((l) => l.id === id).mask, "selection to mask");
  E.selection.clearSelection();
  const ai = await E.runAiTool({
    id: "test-vector",
    name: "add_vector",
    source: "assistant",
    documentId: E.useDoc.getState().doc.id,
    input: {
      vector: { shape: "ellipse", width: 80, height: 80, fillColor: "#56b8ec" },
      x: 470,
      y: 120,
    },
  });
  assert(ai.ok, "assistant creates editable vectors");
  const aid = E.useDoc.getState().activeId;
  E.ops.setLayerProps(aid, { locked: true });
  let rejected = false;
  try {
    E.vector.editVector(aid, { width: 100 });
  } catch {
    rejected = true;
  }
  assert(rejected, "locked vectors cannot be edited");
  E.ops.setLayerProps(aid, { locked: false });
  E.ops.rotateImage(1);
  assert(E.useDoc.getState().doc.width === 420, "rotate document with vectors");
  E.useDoc.getState().undo();
  E.useUi.setState({ tool: "move", tab: "props", penPoints: [] });
  await wait(200);
  document.querySelector('[aria-label="Mais ferramentas"]')?.click();
  await wait(40);
  assert(document.querySelectorAll(".tool").length >= 15, "all designed tools exposed");
  return { passed: results.length, results };
})();
