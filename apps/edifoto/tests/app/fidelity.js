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
  // Reopen exactly the same bitmap IDs with different pixels (GPU generation regression).
  fresh();
  const raster = D.getState().doc.layers[0],
    key = raster.bitmap;
  E.bitmaps.requireBitmap(key).ctx.fillStyle = "#ff0000";
  E.bitmaps.requireBitmap(key).ctx.fillRect(0, 0, 100, 100);
  E.bitmaps.touchBitmap(key);
  const model = D.getState().doc;
  const redBytes = await E.files.serializeDocument(model);
  await window.api.writeFile("/test/reopen.edifoto", redBytes);
  await E.files.openPath("/test/reopen.edifoto");
  assert(pixel(20, 20)[0] === 255, "reopen displays saved pixels");
  const blue = document.createElement("canvas");
  blue.width = blue.height = 100;
  blue.getContext("2d").fillStyle = "#0000ff";
  blue.getContext("2d").fillRect(0, 0, 100, 100);
  E.bitmaps.adoptCanvas(blue, key);
  const blueBytes = await E.files.serializeDocument(model);
  // Leave the cache holding red while opening blue from the same persistent IDs.
  await E.files.openPath("/test/reopen.edifoto");
  await window.api.writeFile("/test/reopen.edifoto", blueBytes);
  await E.files.openPath("/test/reopen.edifoto");
  assert(
    pixel(20, 20)[2] === 255 && pixel(20, 20)[0] === 0,
    "reopen invalidates GPU textures for reused bitmap IDs",
  );
  const beforeFailure = D.getState(),
    registry = E.bitmaps.requireBitmap(key);
  let failed = false;
  try {
    E.bitmaps.withBitmapReplacement(new Map([[key, blue]]), () =>
      D.getState().load({ ...model, width: 0 }),
    );
  } catch {
    failed = true;
  }
  assert(
    failed && D.getState() === beforeFailure && E.bitmaps.requireBitmap(key) === registry,
    "failed document preparation preserves model, history and bitmap registry",
  );
  const incompatibleCanvas = document.createElement("canvas");
  incompatibleCanvas.getContext("webgl2");
  failed = false;
  try {
    E.bitmaps.withBitmapReplacement(new Map([[key, incompatibleCanvas]]), () =>
      D.getState().load(model),
    );
  } catch {
    failed = true;
  }
  assert(
    failed && E.bitmaps.requireBitmap(key) === registry,
    "unavailable pixel context cannot replace previous registry",
  );
  // Compare transformed gradients against the original rendered image, not their JSON.
  for (const type of ["linear", "radial"]) {
    fresh();
    E.ops.addLayer({
      kind: "gradient",
      gradient: { type, angle: 33, cx: 0.2, cy: 0.3, scale: 0.8 },
    });
    const original = E.compositor().renderToCanvas(D.getState().doc);
    const sample = (c, x, y) => Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data);
    const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
    E.ops.crop(40, 10, 50, 60);
    assert(
      close(pixel(10, 15), sample(original, 50, 25)),
      `${type} gradient crop preserves original colors outside its center`,
    );
    const parsedGradient = await E.files.parseDocument(
      await E.files.serializeDocument(D.getState().doc),
    );
    assert(
      parsedGradient.doc.layers.at(-1).gradient.space.width === 100,
      `${type} gradient frame survives project roundtrip`,
    );
    D.getState().undo();
    E.ops.resizeImage(200, 100);
    assert(
      close(pixel(80, 25), sample(original, 40, 25)),
      `${type} gradient preserves nonuniform scaling`,
    );
    D.getState().undo();
    E.ops.rotateImage(1);
    assert(
      close(pixel(74, 40), sample(original, 40, 25)),
      `${type} gradient follows whole-image rotation`,
    );
    D.getState().undo();
    E.ops.flipImage("horizontal");
    assert(
      close(pixel(59, 25), sample(original, 40, 25)),
      `${type} gradient follows whole-image flip`,
    );
    D.getState().undo();
    const steps = D.getState().past.length;
    E.ops.rotateImage(2);
    assert(
      D.getState().past.length === steps + 1 && close(pixel(59, 74), sample(original, 40, 25)),
      `${type} 180 degree rotation preserves colors in one undo step`,
    );
    D.getState().undo();
    assert(
      close(pixel(40, 25), sample(original, 40, 25)),
      `${type} rotation undo restores original colors`,
    );
  }
  return { passed: results.length, results };
})();
