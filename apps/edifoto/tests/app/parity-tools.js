globalThis.__parityTestRun = (async () => {
  const E = window.__edifoto,
    results = [],
    wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const assert = (ok, label) => {
    if (!ok) throw new Error(label);
    results.push(label);
  };
  E.useDoc.getState().load(E.ops.blankDoc(640, 420, "Aceite 0.2", "#000000"));
  const id = E.vector.addVector(
    {
      shape: "rectangle",
      width: 160,
      height: 100,
      radius: 0,
      fillColor: "#ff0000",
      fillOpacity: 0.5,
      strokeColor: "#ffffff",
      strokeWidth: 8,
    },
    { x: 320, y: 210 },
  );
  E.useUi.setState({ tool: "shape", tab: "layers" });
  await wait(120);
  const c = E.compositor().renderToCanvas(E.useDoc.getState().doc),
    ctx = c.getContext("2d");
  assert(
    Math.abs(ctx.getImageData(320, 210, 1, 1).data[0] - 128) < 3,
    "fill opacity renders independently",
  );
  assert(
    ctx.getImageData(243, 210, 1, 1).data[1] > 245,
    "stroke stays opaque with translucent fill",
  );
  const serialized = await E.files.serializeDocument(E.useDoc.getState().doc),
    parsed = await E.files.parseDocument(serialized);
  assert(
    parsed.doc.layers.at(-1).vector.fillOpacity === 0.5,
    "fill opacity survives save and reopen",
  );
  assert(
    document.querySelectorAll(".shape-grid button").length === 6,
    "six shape buttons in contextual panel",
  );
  assert(
    document.querySelectorAll(".overlay rect.handle").length === 8,
    "eight transform handles with shape tool active",
  );
  const change = (el, value) => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    ).set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  };
  const fill = document.querySelector('.optionsbar input[type="color"]');
  assert(!!fill, "selected shape appearance in toolbar");
  change(fill, "#00ff00");
  await wait(80);
  assert(
    E.useDoc.getState().doc.layers.at(-1).vector.fillColor === "#00ff00",
    "toolbar edits selected vector",
  );
  change(document.querySelector('[aria-label="Buscar camadas"]'), "nenhuma");
  await wait(70);
  assert(document.querySelectorAll(".layer-row").length === 0, "search filters layers");
  change(document.querySelector('[aria-label="Buscar camadas"]'), "");
  change(document.querySelector('[aria-label="Filtrar camadas"]'), "vector");
  await wait(70);
  assert(document.querySelectorAll(".layer-row").length === 1, "layer type filter");
  change(document.querySelector('[aria-label="Filtrar camadas"]'), "all");
  await wait(50);
  const vp = document.querySelector(".viewport"),
    r = vp.getBoundingClientRect();
  const send = async (el, type, x, y, extra = {}) => {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        pointerId: 9,
        ...extra,
      }),
    );
    await wait(45);
  };
  const side = document.querySelectorAll(".overlay rect.handle")[1],
    sr = side.getBoundingClientRect();
  await send(side, "pointerdown", sr.x + 4, sr.y + 4);
  await send(vp, "pointermove", sr.x + 44, sr.y + 4);
  await send(vp, "pointerup", sr.x + 44, sr.y + 4);
  assert(
    E.useDoc.getState().doc.layers.at(-1).vector.width > 160 &&
      E.useDoc.getState().doc.layers.at(-1).vector.height === 100,
    "side handle changes width independently",
  );
  E.useDoc.getState().undo();
  E.useUi.setState({
    tool: "pen",
    penPoints: [
      { x: 100, y: 100 },
      { x: 200, y: 160 },
      { x: 300, y: 100 },
    ],
    penSelected: null,
  });
  await wait(80);
  const v = E.useUi.getState().view;
  const anchor = document.querySelector(".overlay rect.handle"),
    ar = anchor.getBoundingClientRect();
  await send(anchor, "pointerdown", ar.x + 4, ar.y + 4, { ctrlKey: true });
  await send(vp, "pointermove", ar.x + 24, ar.y + 14, { ctrlKey: true });
  await send(vp, "pointerup", ar.x + 24, ar.y + 14, { ctrlKey: true });
  assert(
    E.useUi.getState().penPoints.length === 3 && E.useUi.getState().penPoints[0].x !== 100,
    "Ctrl moves draft anchor without closing path",
  );
  E.useUi.setState({ penPoints: [], tool: "shape" });
  await wait(50);
  const { useAssistant } = await import("/src/renderer/src/state/assistant.ts");
  E.ops.setLayerProps(id, { name: "Resultado do assistente" });
  const historyId = E.useDoc.getState().past.at(-1).id,
    documentId = E.useDoc.getState().doc.id;
  useAssistant.setState({
    busy: false,
    items: [
      {
        id: 990,
        role: "assistant",
        text: "Alteração concluída.",
        tools: [],
        historyId,
        documentId,
        layerId: id,
      },
    ],
  });
  E.useUi.setState({ assistantOpen: true });
  await wait(100);
  const undo = () =>
    [...document.querySelectorAll(".msg button")].find((b) => b.textContent === "Desfazer edição");
  assert(undo() && !undo().disabled, "assistant exposes undo for its latest turn");
  E.ops.setLayerProps(id, { opacity: 0.8 });
  await wait(70);
  assert(undo().disabled, "assistant undo protects subsequent edits");
  E.useDoc.getState().undo();
  await wait(70);
  undo().click();
  await wait(70);
  assert(
    E.useDoc.getState().doc.layers.at(-1).name === "Retângulo",
    "assistant button undoes correct history entry",
  );
  E.useUi.setState({ assistantOpen: false, tool: "shape", tab: "layers" });
  await wait(80);
  return { passed: results.length, results };
})();
