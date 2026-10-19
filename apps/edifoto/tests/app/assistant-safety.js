globalThis.__assistantTestRun = (async () => {
  const until = async (fn) => {
    const deadline = performance.now() + 15000;
    while (!fn()) {
      if (performance.now() > deadline) throw new Error("Assistant check timed out");
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
  const fresh = () => {
    D.getState().load(E.ops.blankDoc(100, 80, "Example", "#ffffff"));
    U.setState({ confirm: null, ai: { confirmDeletes: true, allowFileWrites: false } });
  };
  let sequence = 0;
  const call = (name, input, extra = {}) =>
    E.runAiTool({
      id: `test-${sequence++}`,
      name,
      input,
      source: "assistant",
      documentId: D.getState().doc?.id,
      runId: "turn",
      ...extra,
    });
  fresh();
  let id = D.getState().activeId;
  let r = await call("set_layer", { layer_id: id, locked: true, x: 20 });
  assert(
    !r.ok && !D.getState().doc.layers.at(-1).locked && !D.getState().past.length,
    "compound failure rolls back lock and history",
  );
  await call("set_layer", { layer_id: id, opacity: 80 });
  E.ops.setLayerProps(id, { name: "Manual" });
  await call("set_layer", { layer_id: id, opacity: 50 });
  assert(
    D.getState().past.length === 3 &&
      D.getState().past[0].byAi &&
      !D.getState().past[1].byAi &&
      D.getState().past[2].byAi,
    "manual edit stays separate between assistant edits",
  );
  D.getState().undo();
  assert(
    D.getState().doc.layers.at(-1).name === "Manual" &&
      D.getState().doc.layers.at(-1).opacity === 0.8,
    "assistant undo preserves intervening manual work",
  );
  fresh();
  id = D.getState().activeId;
  let promise = call("delete_layer", { layer_id: id });
  await until(() => U.getState().confirm);
  E.ops.setLayerProps(id, { name: "Changed while waiting" });
  U.getState().confirm.resolve(true);
  U.setState({ confirm: null });
  r = await promise;
  assert(
    !r.ok && D.getState().doc.layers.at(-1).name === "Changed while waiting",
    "confirmation cannot delete after manual editing",
  );
  promise = call("delete_layer", { layer_id: id }, { id: "cancel-confirm" });
  await until(() => U.getState().confirm);
  window.__testAiCancel("cancel-confirm");
  r = await promise;
  assert(
    !r.ok && !U.getState().confirm && D.getState().doc.layers.length === 2,
    "stop cancels pending confirmation without deleting",
  );
  const previousWorkspace = D.getState().initialStateId,
    sameDoc = D.getState().doc;
  D.getState().load(sameDoc);
  r = await call("add_layer", { kind: "solid" }, { workspaceId: previousWorkspace });
  assert(!r.ok, "workspace identity rejects a reopened project with the same persistent id");
  const previous = D.getState().doc.id;
  fresh();
  const current = D.getState().doc.id;
  r = await call("add_layer", { kind: "solid", color: "#123456" }, { documentId: previous });
  assert(
    !r.ok && D.getState().doc.id === current && D.getState().doc.layers.length === 2,
    "late tool cannot edit replacement document",
  );
  r = await call("add_layer", { kind: "solid" }, { documentId: undefined, source: "mcp" });
  assert(!r.ok, "external mutation requires explicit document identity");
  r = await call(
    "add_layer",
    { kind: "solid", document_id: current },
    { documentId: undefined, source: "mcp" },
  );
  assert(r.ok, "external mutation accepts matching document identity");
  r = await call("export_image", { path: "/test/denied.png", format: "png" });
  assert(!r.ok, "export permission remains enforced");
  const originalRead = window.api.readFile;
  let release;
  window.api.readFile = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  promise = call("place_image", { path: "/test/image.png" }, { id: "cancel-read" });
  await until(() => release);
  window.__testAiCancel("cancel-read");
  const image = document.createElement("canvas");
  image.width = 2;
  image.height = 2;
  const blob = await new Promise((resolve) => image.toBlob(resolve));
  release(new Uint8Array(await blob.arrayBuffer()));
  const count = D.getState().doc.layers.length;
  r = await promise;
  window.api.readFile = originalRead;
  assert(
    !r.ok && D.getState().doc.layers.length === count,
    "cancelled file decoding cannot insert a layer",
  );
  const { useAssistant: A } = await import("/src/renderer/src/state/assistant.ts");
  await A.getState().send("Ajustar a imagem");
  const run = A.getState().runId;
  window.__testAssistantEvent(run, { type: "text", delta: "Pronto" });
  await call("set_layer", { layer_id: D.getState().activeId, opacity: 70 }, { runId: run });
  window.__testAssistantEvent(run, { type: "error", message: "Cliente indisponível" });
  window.__testAssistantEvent(run, { type: "done" });
  assert(
    !A.getState().busy &&
      A.getState().items.find((item) => item.role === "assistant").historyId ===
        D.getState().past.at(-1).id,
    "partial successful edit retains undo after client error",
  );
  fresh();
  window.__testAssistantEvent(run, { type: "text", delta: "stale" });
  assert(
    !A.getState().items.length,
    "switching documents clears conversation and ignores stale events",
  );
  U.setState({ settingsOpen: true });
  await until(() =>
    document.querySelector('dialog[aria-label="Configurações de inteligência artificial"]'),
  );
  assert(
    !document.querySelector('input[type="password"]') &&
      !document.querySelector(".modal").textContent.includes("Anthropic"),
    "settings offer personal clients without API billing",
  );
  U.setState({ settingsOpen: false });
  return { passed: results.length, results };
})();
