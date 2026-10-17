(async () => {
  for (let i = 0; i < 80 && !window.__edifoto; i++) await new Promise((r) => setTimeout(r, 100));
  const E = window.__edifoto;
  const out = {};
  const save = async (name, b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await window.api.writeFile(
      "C:/Users/julio/Desktop/CRIECOMHELENAEJULIO/APPS/EDIFOTO/.tmp/" + name,
      bin,
    );
  };
  await E.files.openPath(
    "C:/Users/julio/Desktop/CRIECOMHELENAEJULIO/APPS/EDIFOTO/tests/fixtures/praia.jpg",
  );
  const call = (name, input) => E.runAiTool({ id: "x", name, input, source: "assistant" });
  let r = await call("add_layer", {
    kind: "gradient",
    name: "Pôr do sol",
    blend_mode: "overlay",
    opacity: 80,
    gradient: {
      angle: 90,
      stops: [
        { color: "#2244ff", position: 0 },
        { color: "#ff7a00", position: 1 },
      ],
    },
  });
  out.add = r.text;
  const id = E.useDoc.getState().activeId;
  r = await call("preview_blend_modes", { layer_id: id });
  out.sheet = r.text.slice(0, 120);
  await save("sheet.jpg", r.image.data);
  r = await call("analyze_image", {});
  out.analyze = r.text;
  r = await call("auto_adjust", {});
  out.auto = r.text;
  r = await call("add_layer", {
    kind: "adjustment",
    name: "Céu",
    adjustment: { exposure: -0.6, contrast: 30, saturation: 25 },
  });
  const sky = E.useDoc.getState().activeId;
  r = await call("set_mask", { layer_id: sky, mode: "linear", angle: 90, start: 0.2, end: 0.5 });
  out.mask = r.text;
  r = await call("crop", { aspect: "4:5" });
  out.crop = r.text;
  r = await call("get_document", {});
  out.doc = r.text;
  r = await call("get_preview", { max_size: 900 });
  await save("preview.jpg", r.image.data);
  // save + reopen round trip
  const path = "C:/Users/julio/Desktop/CRIECOMHELENAEJULIO/APPS/EDIFOTO/.tmp/teste.edifoto";
  await E.files.writeDocument(path);
  const layersBefore = E.useDoc.getState().doc.layers.length;
  await E.files.openPath(path);
  out.reopen = [
    layersBefore,
    E.useDoc.getState().doc.layers.length,
    E.useDoc.getState().doc.width,
    E.useDoc.getState().doc.height,
  ];
  r = await call("get_preview", { max_size: 900 });
  await save("preview-reopen.jpg", r.image.data);
  // undo
  r = await call("undo", {});
  out.undo = r.text;
  r = await call("export_image", { path: "C:/x.png", format: "png" });
  out.exportDenied = r.ok + " " + r.text.slice(0, 60);
  return out;
})();
