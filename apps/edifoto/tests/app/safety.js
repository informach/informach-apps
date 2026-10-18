globalThis.__safetyTestRun = (async () => {
  const until = async (fn) => {
    const deadline = performance.now() + 15000;
    while (!fn()) {
      if (performance.now() > deadline) throw new Error("Safety check timed out");
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
  const fresh = () =>
    D.getState().load(E.ops.blankDoc(100, 100, "Example", null), { dirty: false });
  fresh();
  const bytes = await E.files.serializeDocument(D.getState().doc);
  await window.api.writeFile("/test/other.edifoto", bytes);
  E.ops.addLayer({ kind: "solid", color: "#ff0000" });
  const current = D.getState().doc;
  const opening = E.actions.openPath("/test/other.edifoto");
  await until(() => U.getState().confirm);
  U.getState().confirm.resolve(false);
  await opening;
  assert(D.getState().doc === current, "cancelled replacement preserves document and history");
  let release;
  const write = window.api.writeFile;
  window.api.writeFile = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  try {
    const save = E.files.writeDocument("/test/saved.edifoto");
    await until(() => release);
    E.ops.addLayer({ kind: "solid", color: "#00ff00" });
    release();
    await save;
    assert(D.getState().dirty, "editing during save remains unsaved");
    release = undefined;
    const second = E.files.writeDocument("/test/saved.edifoto");
    await until(() => release);
    fresh();
    const next = D.getState().doc.id;
    release();
    await second;
    assert(
      D.getState().doc.id === next && D.getState().filePath === null,
      "late save never assigns another document's path",
    );
    release = undefined;
    const old = D.getState().doc;
    const third = E.files.writeDocument("/test/late-copy.edifoto");
    await until(() => release);
    D.getState().load(old, { filePath: "/test/reopened.edifoto" });
    release();
    await third;
    assert(
      D.getState().filePath === "/test/reopened.edifoto" && !D.getState().dirty,
      "late save cannot reassign a reopened project's path even with the same document id",
    );
  } finally {
    window.api.writeFile = write;
  }
  fresh();
  D.getState().markSaved("/test/saved.edifoto");
  E.ops.addLayer({ kind: "solid" });
  D.getState().undo();
  assert(!D.getState().dirty, "undo to savepoint clears unsaved indicator");
  E.ops.setLayerProps(D.getState().activeId, { opacity: 0.8 });
  D.getState().markSaved("/test/saved.edifoto");
  E.ops.setLayerProps(D.getState().activeId, { opacity: 0.6 });
  D.getState().undo();
  assert(
    !D.getState().dirty && D.getState().doc.layers[0].opacity === 0.8,
    "slider merging cannot erase a savepoint",
  );
  fresh();
  for (let i = 0; i < 90; i++) {
    const copy = E.ops.duplicateLayer(D.getState().activeId);
    E.ops.deleteLayer(copy);
  }
  assert(
    E.bitmaps.bitmapIds().length <= 42,
    "unreferenced bitmaps are released beyond retained history",
  );
  const recovery = await import("/src/renderer/src/lib/recovery.ts");
  fresh();
  E.ops.addLayer({ kind: "solid", color: "#334455" });
  await recovery.flushRecovery();
  assert(
    (await recovery.readRecovery()).name === "Example",
    "durable backup stores a validated project",
  );
  D.getState().close();
  await recovery.restoreRecovery();
  assert(
    D.getState().dirty && !D.getState().filePath && D.getState().doc.layers.length === 2,
    "recovery restores editable work detached from saved original",
  );
  const pendingBackup = recovery.flushRecovery();
  const pendingDiscard = recovery.discardRecovery();
  await pendingBackup;
  await pendingDiscard;
  assert(!(await recovery.readRecovery()), "discard stays final when a backup encoder is pending");
  await recovery.discardRecovery();
  assert(!(await recovery.readRecovery()), "discard removes only local recovery copy");
  await E.files.exportTo("/test/output.jpeg", { format: "jpeg", quality: 90, scale: 1 });
  assert(
    (await window.api.readFile("/test/output.jpeg")).length > 0,
    "JPEG export preserves selected .jpeg path",
  );
  let closed = 0;
  const oldClose = window.api.closeSaved;
  window.api.closeSaved = async () => {
    closed++;
  };
  try {
    E.ops.addLayer({ kind: "solid" });
    await recovery.flushRecovery();
    window.__testBeforeClose("discard");
    await until(() => closed === 1);
    assert(
      !(await recovery.readRecovery()),
      "explicit close without saving awaits recovery discard",
    );
    window.__testBeforeClose("save");
    await until(() => closed === 2);
    assert(
      !D.getState().dirty && !(await recovery.readRecovery()),
      "save before close finishes file write and recovery cleanup",
    );
  } finally {
    window.api.closeSaved = oldClose;
  }
  fresh();
  const oldPicker = window.api.pickSavePath;
  let resolvePicker;
  window.api.pickSavePath = () =>
    new Promise((resolve) => {
      resolvePicker = resolve;
    });
  try {
    const pendingExport = E.actions.quickExport();
    await until(() => resolvePicker);
    fresh();
    resolvePicker("/test/incorrect-document.jpg");
    let rejected = false;
    try {
      await pendingExport;
    } catch (error) {
      rejected = /imagem mudou/.test(error.message);
    }
    assert(rejected, "quick export cannot export a replacement document after the native picker");
  } finally {
    window.api.pickSavePath = oldPicker;
  }
  const invalidPng = new Uint8Array(await E.files.serializeDocument(D.getState().doc));
  const headerLength = new DataView(invalidPng.buffer).getUint32(8, true);
  new DataView(invalidPng.buffer).setUint32(12 + headerLength + 16, 101);
  await window.api.writeFile("/test/incorrect-png.edifoto", invalidPng);
  const beforeInvalid = D.getState();
  let invalidRejected = false;
  try {
    await E.files.openPath("/test/incorrect-png.edifoto");
  } catch (error) {
    invalidRejected = /dimensões/.test(error.message);
  }
  assert(
    invalidRejected && D.getState() === beforeInvalid,
    "PNG dimension mismatch is rejected before decompression without changing workspace",
  );
  const nextRecovery = await import("/src/renderer/src/lib/recovery.ts?recovery-generation=next");
  const templates = await import("/src/shared/templates.ts");
  await recovery.discardRecovery();
  await nextRecovery.readRecovery();
  D.getState().load(E.ops.blankDoc(640, 480, "Older renderer", "#ffffff"));
  const olderBackup = recovery.flushRecovery();
  D.getState().load(templates.createImageTemplate("headline"));
  const newestName = D.getState().doc.name;
  const newestBackup = nextRecovery.flushRecovery();
  await newestBackup;
  await olderBackup;
  assert(
    (await nextRecovery.readRecovery()).name === newestName,
    "an older renderer encoder cannot overwrite a newer recovery checkpoint",
  );
  D.getState().load(E.ops.blankDoc(640, 480, "Older discarded renderer", "#ffffff"));
  const oldDiscardedBackup = recovery.flushRecovery();
  await nextRecovery.discardRecovery();
  await oldDiscardedBackup;
  assert(
    !(await nextRecovery.readRecovery()),
    "discard watermark prevents a previous renderer from recreating a draft",
  );
  window.dispatchEvent(new Event("pagehide"));
  D.getState().load(templates.createImageTemplate("headline"));
  await nextRecovery.flushRecovery();
  const currentDraft = await nextRecovery.readRecovery();
  const retainedId = (await E.files.parseDocument(currentDraft.bytes)).doc.id;
  D.getState().load(E.ops.blankDoc(32, 32, "Closed page stale document", null));
  await recovery.flushRecovery();
  await recovery.discardRecovery();
  assert(
    (await E.files.parseDocument((await nextRecovery.readRecovery()).bytes)).doc.id === retainedId,
    "a closed page cannot write or discard recovery",
  );
  return { passed: results.length, results };
})();
