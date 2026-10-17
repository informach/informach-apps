(async () => {
  for (let i = 0; i < 80 && !window.__edifoto; i++) await new Promise((r) => setTimeout(r, 100));
  const E = window.__edifoto;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await E.files.openPath(
    "C:/Users/julio/Desktop/CRIECOMHELENAEJULIO/APPS/EDIFOTO/tests/fixtures/praia.jpg",
  );
  await wait(400);
  const vp = document.querySelector(".viewport");
  const rect = vp.getBoundingClientRect();
  const ev = (type, x, y) =>
    vp.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
  const stroke = (pts) => {
    ev("pointerdown", ...pts[0]);
    for (const p of pts.slice(1)) ev("pointermove", ...p);
    ev("pointerup", ...pts[pts.length - 1]);
  };
  // 1) brush on a new empty layer, multiply mode
  E.actions.newLayer();
  E.useUi.setState({
    tool: "brush",
    fg: "#1e5bff",
    brush: { size: 120, hardness: 40, opacity: 70, flow: 100, mode: "source-over" },
  });
  await wait(100);
  const cx = rect.width / 2;
  stroke(Array.from({ length: 30 }, (_, i) => [cx - 200 + i * 14, 200 + Math.sin(i / 3) * 60]));
  E.ops.setLayerProps(E.useDoc.getState().activeId, { blendMode: "multiply" });
  // 2) adjustment layer + paint its mask (brush on adjust layer creates a mask)
  E.ops.addLayer({ kind: "adjust", name: "P&B", adjust: { grayscale: true } });
  await wait(100);
  stroke(Array.from({ length: 20 }, (_, i) => [cx - 150 + i * 15, 450]));
  // 3) eraser on Fundo? locked? just undo/redo the last stroke
  E.useDoc.getState().undo();
  E.useDoc.getState().redo();
  await wait(300);
  const d = E.useDoc.getState();
  const painted = (id) => {
    const b = E.bitmaps.getBitmap(id);
    const px = b.ctx.getImageData(0, 0, b.canvas.width, b.canvas.height).data;
    let n = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
    return n;
  };
  const darkMask = (id) => {
    const b = E.bitmaps.getBitmap(id);
    const px = b.ctx.getImageData(0, 0, b.canvas.width, b.canvas.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 128) n++;
    return n;
  };
  const lay = d.doc.layers;
  return {
    paintedPixels: painted(lay[1].bitmap),
    maskDarkPixels: darkMask(lay[2].mask.bitmap),
    past: d.past.map((p) => p.label),
    layers: d.doc.layers.map((l) => `${l.name}:${l.kind}:${l.blendMode}:${l.mask ? "mask" : "-"}`),
  };
})();
