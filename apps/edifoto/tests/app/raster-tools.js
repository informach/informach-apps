globalThis.__rasterTestRun = (async () => {
  const E = window.__edifoto,
    results = [],
    wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    results.push(label);
  };
  const original = E.useDoc.getState().doc;
  const photo = document.createElement("canvas");
  photo.width = 160;
  photo.height = 100;
  const ctx = photo.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 160, 100);
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(20, 20, 40, 40);
  E.useDoc.getState().load(E.ops.docFromImage(photo, 160, 100, "Raster checks"));
  const id = E.useDoc.getState().activeId;
  const pixel = (x, y) => {
    const l = E.useDoc.getState().doc.layers[0];
    return E.bitmaps.requireBitmap(l.bitmap).ctx.getImageData(x, y, 1, 1).data;
  };
  E.useUi.setState({
    tool: "clone",
    cloneSource: { x: 40, y: 40 },
    brush: { size: 20, hardness: 100, opacity: 100, flow: 100, mode: "source-over" },
    selection: null,
    paintTarget: "layer",
  });
  assert(!E.paint.beginStroke(110, 40, false), "clone accepts source");
  E.paint.endStroke();
  assert(pixel(110, 40)[1] < 10, "clone copies source color");
  E.useDoc.getState().undo();
  assert(pixel(110, 40)[1] === 255, "clone undo restores pixels");
  E.useUi.setState({ tool: "blur", brush: { ...E.useUi.getState().brush, size: 40 } });
  E.paint.beginStroke(59, 40, false);
  E.paint.endStroke();
  assert(pixel(59, 40)[1] > 10, "blur softens the edge");
  E.useDoc.getState().undo();
  E.selection.selectPolygon([
    { x: 80, y: 0 },
    { x: 160, y: 0 },
    { x: 160, y: 100 },
    { x: 80, y: 100 },
  ]);
  E.useUi.setState({
    tool: "brush",
    fg: "#000000",
    brush: { size: 100, hardness: 100, opacity: 100, flow: 100, mode: "source-over" },
  });
  E.paint.beginStroke(80, 80, false);
  E.paint.endStroke();
  assert(
    pixel(70, 80)[0] === 255 && pixel(90, 80)[0] < 10,
    "selection clips paint to selected region",
  );
  E.useDoc.getState().undo();
  E.selection.clearSelection();
  E.selection.selectWand(10, 10);
  const mask = E.bitmaps.requireBitmap(E.useUi.getState().selection).ctx;
  assert(
    mask.getImageData(10, 10, 1, 1).data[3] === 255 &&
      mask.getImageData(40, 40, 1, 1).data[3] === 0,
    "wand selects connected background only",
  );
  E.selection.invertSelection();
  E.selection.deleteSelectedPixels();
  assert(
    pixel(40, 40)[3] === 0 && pixel(10, 10)[3] === 255,
    "delete selection only removes selected pixels",
  );
  E.useDoc.getState().undo();
  E.selection.clearSelection();
  E.selection.removeBackground();
  const layer = E.useDoc.getState().doc.layers[0],
    bm = E.bitmaps.requireBitmap(layer.mask.bitmap).ctx;
  assert(
    bm.getImageData(10, 10, 1, 1).data[0] === 0 && bm.getImageData(40, 40, 1, 1).data[0] === 255,
    "background removal preserves colored foreground",
  );
  E.useDoc.getState().undo();
  E.ops.addLayer({ kind: "adjust", adjust: { curves: [0, 0, 0, 0, 0] } });
  const c = E.compositor().renderToCanvas(E.useDoc.getState().doc);
  assert(
    c.getContext("2d").getImageData(10, 10, 1, 1).data[0] < 3,
    "curves change rendered pixels",
  );
  E.useDoc.getState().undo();
  for (const format of ["png", "jpeg", "webp"]) {
    const path = await E.files.exportTo(`/test/export.${format}`, {
      format,
      quality: 90,
      scale: 1,
    });
    const bytes = await window.api.readFile(path);
    assert(bytes.length > 100, `exports ${format}`);
  }
  E.useDoc.getState().load(original);
  E.useUi.setState({ tool: "move", selection: null, selectionPreview: null, tab: "props" });
  await wait(100);
  E.useUi.setState({ compareOpen: true });
  await wait(150);
  assert(
    document.querySelectorAll(".compare-option img").length === 2,
    "side by side comparison renders two versions",
  );
  const apply = [...document.querySelectorAll(".compare-option button")][1];
  apply.click();
  await wait(50);
  assert(
    E.useDoc.getState().doc.layers.at(-1).blendMode === "softLight",
    "comparison applies chosen mode",
  );
  E.useDoc.getState().undo();
  return { passed: results.length, results };
})();
