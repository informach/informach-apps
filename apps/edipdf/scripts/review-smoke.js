(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  for (let i = 0; i < 100 && !window.__edipdf?.store.activeDoc(); i++) await wait(100);
  const { actions, editing, store } = window.__edipdf;
  const initial = store.activeDoc();
  check(
    initial?.path?.includes(".review"),
    "Use a fixture copied into .review to protect originals",
  );
  const id = initial.id;
  const get = () => store.useApp.getState().docs.find((d) => d.id === id);
  const count = initial.content.pages.length;
  const first = initial.content.pages[0];
  actions.duplicatePages(id, [first.id]);
  check(get().content.pages.length === count + 1, "Duplicate page");
  store.undo(id);
  check(get().content.pages.length === count, "Undo");
  store.redo(id);
  check(get().content.pages.length === count + 1, "Redo");
  actions.deletePages(id, [get().content.pages[1].id]);
  actions.rotatePages(id, [first.id], 90);
  check(get().content.pages[0].rotation === 90, "Rotate");
  store.undo(id);
  editing.startNewText(id, first, 72, 80);
  editing.updateDraft(id, { text: "Review: draft preserved on tool change" });
  store.setTool("hand");
  check(
    !get().draft && get().content.annots.some((a) => a.text?.includes("tool change")),
    "Switch tool commits draft without recursion",
  );
  store.setTool("select");
  editing.startNewText(id, first, 72, 110);
  editing.updateDraft(id, { text: "Review: saved while editing" });
  store.patchDoc(id, { path: initial.path.replace(/sample\.pdf$/i, "review-result.pdf") });
  check(await actions.saveDoc(id), "Save");
  check(!get().draft && !store.isDirty(get()), "Save commits draft");
  const saved = await window.api.readFile(get().path);
  check(saved?.bytes.length > 0, "Saved bytes");
  check(await actions.closeDoc(id), "Close saved document");
  await actions.openFiles([saved]);
  check(store.activeDoc()?.content.pages.length === count, "Reopen maintains page count");
  await wait(1200);
  check(document.querySelector("canvas")?.width > 0, "Page canvas rendered");
  check(!document.querySelector(".busy"), "No stuck busy overlay");
  return { passed: true, checks: 12, pages: count, savedBytes: saved.bytes.length };
})();
