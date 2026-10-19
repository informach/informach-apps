globalThis.__fidelityTestRun = (async () => {
  const until = async (fn) => {
    const deadline = performance.now() + 15000;
    while (!fn()) {
      if (performance.now() > deadline) throw new Error("Fidelity check timed out");
      await new Promise(requestAnimationFrame);
    }
  };
  await until(() => window.__edifoto);
  const E = window.__edifoto,
    D = E.useDoc,
    results = [];
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    results.push(label);
  };
  const fresh = () =>
    D.getState().load(E.ops.blankDoc(100, 100, "Example", null), { dirty: false });
  const pixel = (x, y) =>
    Array.from(
      E.compositor().renderToCanvas(D.getState().doc).getContext("2d").getImageData(x, y, 1, 1)
        .data,
    );
  fresh();
  let id = D.getState().activeId;
  const b = E.bitmaps.requireBitmap(D.getState().doc.layers[0].bitmap);
  b.ctx.fillStyle = "#ff0000";
  b.ctx.fillRect(0, 0, 100, 100);
  E.bitmaps.touchBitmap(D.getState().doc.layers[0].bitmap);
  E.ops.addMask(id, "hide");
  const mask = D.getState().doc.layers[0].mask;
  const m = E.bitmaps.requireBitmap(mask.bitmap);
  m.ctx.fillStyle = "#fff";
  m.ctx.fillRect(0, 0, 50, 100);
  E.bitmaps.touchBitmap(mask.bitmap);
  E.ops.setTransform(id, { x: 75 });
  assert(pixel(60, 50)[3] === 255 && pixel(80, 50)[3] === 0, "linked mask moves with image");
  const before = pixel(60, 50);
  E.ops.setMaskLinked(id, false);
  assert(pixel(60, 50).join() === before.join(), "unlink preserves current cutout");
  E.ops.setTransform(id, { x: 50 });
  assert(pixel(60, 50)[3] === 255, "unlinked mask stays in document space");
  E.ops.setMaskLinked(id, true);
  E.ops.resizeImage(200, 100);
  assert(
    pixel(120, 50)[3] === 255 && pixel(170, 50)[3] === 0,
    "nonuniform resize keeps linked mask and content aligned",
  );
  const saved = await E.files.parseDocument(await E.files.serializeDocument(D.getState().doc));
  assert(
    saved.doc.layers[0].transform.basis[0] === 2 && saved.doc.layers[0].mask.reference,
    "format preserves resize basis and mask reference",
  );
  D.getState().undo();
  assert(D.getState().doc.width === 100, "resize undo restores geometry");
  D.getState().redo();
  assert(D.getState().doc.width === 200, "resize redo restores geometry");
  fresh();
  id = E.ops.addLayer({ kind: "adjust" });
  E.ops.setLayerProps(id, { locked: true });
  const original = JSON.stringify(D.getState().doc),
    count = D.getState().past.length;
  for (const operation of [
    () => E.ops.deleteLayer(id),
    () => E.ops.editLayer(id, { adjust: { exposure: 1 } }),
    () => E.ops.addMask(id),
    () => E.ops.setLayerProps(id, { opacity: 0.5 }),
  ]) {
    let failed = false;
    try {
      operation();
    } catch {
      failed = true;
    }
    assert(
      failed && JSON.stringify(D.getState().doc) === original && D.getState().past.length === count,
      "locked operation leaves document unchanged",
    );
  }
  fresh();
  E.ops.addLayer({ kind: "solid", color: "#808080" });
  const below = E.ops.addLayer({ kind: "solid", color: "#ff0000" });
  const top = E.ops.addLayer({ kind: "solid", color: "#0000ff", opacity: 0.5 });
  const render = (doc, ids) =>
    E.compositor().renderToCanvas({ ...doc, layers: doc.layers.filter((l) => ids.includes(l.id)) });
  const normal = pixel(50, 50);
  E.ops.mergeDown(top, render);
  assert(pixel(50, 50).join() === normal.join(), "normal merge preserves composite pixels");
  D.getState().undo();
  E.ops.setLayerProps(below, { blendMode: "multiply" });
  const dependent = pixel(50, 50);
  let rejected = false;
  try {
    E.ops.mergeDown(top, render);
  } catch {
    rejected = true;
  }
  assert(
    rejected && pixel(50, 50).join() === dependent.join(),
    "dependent merge is refused without visual changes",
  );
  fresh();
  await until(() => document.querySelector(".viewport"));
  const c = E.compositor(),
    gl = c.canvas.getContext("webgl2"),
    extension = gl.getExtension("WEBGL_lose_context");
  if (extension) {
    const restored = new Promise((resolve) =>
      c.canvas.addEventListener("webglcontextrestored", resolve, { once: true }),
    );
    const lost = new Promise((resolve) =>
      c.canvas.addEventListener("webglcontextlost", resolve, { once: true }),
    );
    extension.loseContext();
    await lost;
    await new Promise(requestAnimationFrame);
    extension.restoreContext();
    await restored;
    assert(pixel(50, 50)[3] === 0, "GPU context restore rebuilds compositor without document loss");
  }
  const large = E.ops.blankDoc(1280, 1280, "Texture eviction", null);
  D.getState().load(large);
  for (let i = 0; i < 40; i++)
    E.vector.addVector(
      {
        shape: "rectangle",
        width: 600,
        height: 600,
        fillColor: i % 2 ? "#ff0000" : "#0000ff",
        fillOpacity: 0.5,
        strokeColor: null,
      },
      { x: 640, y: 640 },
    );
  const firstPixel = Array.from(
    E.compositor().renderToCanvas(D.getState().doc).getContext("2d").getImageData(640, 640, 1, 1)
      .data,
  );
  const secondPixel = Array.from(
    E.compositor().renderToCanvas(D.getState().doc).getContext("2d").getImageData(640, 640, 1, 1)
      .data,
  );
  assert(
    firstPixel.join() === secondPixel.join() && firstPixel[3] === 255,
    "bounded vector and GPU caches preserve rendering after texture eviction",
  );
  return { passed: results.length, results };
})();
