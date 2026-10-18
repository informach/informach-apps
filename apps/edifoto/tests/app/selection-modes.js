globalThis.__selectionTestRun = (async () => {
  const E = window.__edifoto,
    results = [];
  const wait = () => new Promise((resolve) => setTimeout(resolve, 60));
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    results.push(label);
  };
  const original = E.useDoc.getState().doc;
  const rectangle = (x, y, w, h) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const alpha = (x, y) =>
    E.bitmaps.requireBitmap(E.useUi.getState().selection).ctx.getImageData(x, y, 1, 1).data[3];
  try {
    E.useDoc.getState().load(E.ops.blankDoc(160, 100, "Selection modes", "#ffffff"));
    E.selection.selectPolygon(rectangle(10, 10, 50, 40));
    const old = E.bitmaps.requireBitmap(E.useUi.getState().selection);
    E.selection.selectPolygon(rectangle(40, 10, 50, 40), "add");
    assert(
      alpha(20, 20) === 255 && alpha(80, 20) === 255 && alpha(100, 20) === 0,
      "add preserves both selected regions",
    );
    assert(
      old.ctx.getImageData(80, 20, 1, 1).data[3] === 0,
      "combination does not mutate previous bitmap",
    );
    E.selection.selectPolygon(rectangle(40, 10, 50, 40), "subtract");
    assert(
      alpha(20, 20) === 255 && alpha(50, 20) === 0,
      "subtract removes only the overlapping region",
    );
    E.selection.selectPolygon(rectangle(10, 10, 50, 40));
    E.selection.selectPolygon(rectangle(40, 10, 50, 40), "intersect");
    assert(
      alpha(20, 20) === 0 && alpha(50, 20) === 255 && alpha(80, 20) === 0,
      "intersection keeps only overlap",
    );
    E.selection.selectPolygon(rectangle(100, 60, 20, 20), "intersect");
    assert(
      alpha(50, 20) === 0 && !!E.useUi.getState().selection,
      "disjoint intersection remains an empty selection",
    );
    E.selection.clearSelection();
    E.selection.selectPolygon(rectangle(10, 10, 50, 40), "add");
    assert(alpha(20, 20) === 255, "add without an existing selection starts a selection");
    E.useUi.setState({ view: { zoom: 1, panX: 20, panY: 20 }, selectionMode: "replace" });
    await wait();
    document.querySelector('.toolrail button[aria-keyshortcuts="M"]').click();
    await wait();
    assert(
      document
        .querySelector('.toolrail button[aria-keyshortcuts="M"]')
        .getAttribute("aria-pressed") === "true",
      "toolbar activates rectangular selection",
    );
    const vp = document.querySelector(".viewport"),
      bounds = vp.getBoundingClientRect();
    const send = async (type, x, y, extra = {}) => {
      const v = E.useUi.getState().view;
      vp.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 17,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: bounds.left + v.panX + x * v.zoom,
          clientY: bounds.top + v.panY + y * v.zoom,
          ...extra,
        }),
      );
      await wait();
    };
    await send("pointerdown", 80, 10, { shiftKey: true });
    await send("pointermove", 130, 40, { shiftKey: true });
    await send("pointerup", 130, 40, { shiftKey: true });
    assert(
      alpha(20, 20) === 255 && alpha(100, 20) === 255 && alpha(100, 50) === 0,
      "Shift drag adds a rectangle without forcing square geometry",
    );
    await send("pointerdown", 85, 15, { altKey: true });
    await send("pointermove", 110, 35, { altKey: true });
    await send("pointerup", 110, 35, { altKey: true });
    assert(
      alpha(90, 20) === 0 && alpha(120, 20) === 255,
      "Alt drag subtracts without centering the rectangle",
    );
    const mode = document.querySelector('[aria-label="Modo de seleção"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(
      mode,
      "intersect",
    );
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    await wait();
    assert(
      E.useUi.getState().selectionMode === "intersect",
      "options control updates selection mode",
    );
    document.querySelector('.toolrail button[aria-keyshortcuts="L"]').click();
    await wait();
    await send("pointerdown", 10, 10);
    await send("pointermove", 35, 10);
    await send("pointermove", 35, 35);
    await send("pointermove", 10, 35);
    await send("pointerup", 10, 10);
    assert(alpha(20, 20) === 255 && alpha(120, 20) === 0, "lasso honors intersection mode");
    document.querySelector('.toolrail button[aria-keyshortcuts="W"]').click();
    await wait();
    await send("pointerdown", 5, 5, { altKey: true });
    await send("pointerup", 5, 5, { altKey: true });
    assert(alpha(20, 20) === 0, "wand honors temporary subtraction mode");
    E.selection.selectPolygon(rectangle(10, 10, 20, 20));
    document.querySelector('.toolrail button[aria-keyshortcuts="M"]').click();
    await wait();
    await send("pointerdown", 90, 60);
    await send("pointermove", 130, 90);
    await send("pointercancel", 130, 90);
    assert(
      alpha(20, 20) === 255 && alpha(100, 70) === 0,
      "cancelled drag preserves existing selection",
    );
  } finally {
    E.selection.clearSelection();
    E.useDoc.getState().load(original);
    E.useUi.setState({
      selectionMode: "replace",
      tool: "select",
      fitRequest: E.useUi.getState().fitRequest + 1,
    });
  }
  return { passed: results.length, results };
})();
