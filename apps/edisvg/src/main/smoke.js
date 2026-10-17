import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { newProject } from "../shared/project.js";
export async function smoke(win, bridge, directory) {
  const ui = await win.webContents.executeJavaScript(`(async()=>{
    if(!window.desktop)throw new Error('Preload ausente');
    if(!document.querySelector('.mascot'))throw new Error('Editor ausente');
    document.querySelector('[data-action="assistant"]').click();
    if(document.querySelector('.assistant-panel').hidden)throw new Error('Painel não abriu');
    const status=await window.desktop.aiStatus();
    return {title:document.title,desktop:!!window.desktop,providers:status.clients,mcp:status.mcp};
  })()`);
  if (!ui.mcp.ready) throw new Error(ui.mcp.error);
  const before = await bridge.call("get_overview", {});
  if (!before.ok) throw new Error(before.text);
  const changed = await bridge.call("set_transform", { x: 25, opacity: 80 });
  if (!changed.ok) throw new Error(changed.text);
  const value = JSON.parse(changed.text);
  if (value.transforms.x !== 25 || value.transforms.opacity !== 80)
    throw new Error("Transformação não aplicada");
  const undone = await bridge.call("undo", {});
  if (!undone.ok) throw new Error(undone.text);
  const after = await bridge.call("get_overview", {});
  if (JSON.parse(after.text).transforms.x !== JSON.parse(before.text).transforms.x)
    throw new Error("Undo falhou");
  const redone = await bridge.call("redo", {});
  if (!redone.ok) throw new Error(redone.text);
  const afterRedo = await bridge.call("get_overview", {});
  if (JSON.parse(afterRedo.text).transforms.x !== 25) throw new Error("Redo falhou");
  await bridge.call("undo", {});
  const invalid = await bridge.call("set_transform", { opacity: 200 });
  if (invalid.ok) throw new Error("Validação falhou");
  await win.webContents.executeJavaScript(
    `localStorage.setItem('edisvg-project',${JSON.stringify(JSON.stringify(newProject()))})`,
  );
  await win.loadURL(win.webContents.getURL());
  const toolbar = await toolbarSmoke(win);
  await writeFile(
    join(directory, "desktop-smoke.png"),
    (await win.webContents.capturePage()).toPNG(),
  );
  await writeFile(
    join(directory, "smoke-result.json"),
    JSON.stringify(
      { ok: true, ui, toolbar, bridge: "inspect/edit/undo/validation passed" },
      null,
      2,
    ),
  );
}

export async function toolbarSmoke(win) {
  const js = (code) => win.webContents.executeJavaScript(code);
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const saved = () => js("JSON.parse(localStorage.getItem('edisvg-project'))");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const rail = await js(`(()=>{
    const rail=document.querySelector('.rail'),button=rail.querySelector('[data-tool]');
    return {tools:[...rail.querySelectorAll('[data-tool]')].map(button=>button.dataset.tool),width:rail.getBoundingClientRect().width,button:button.getBoundingClientRect().width,icon:button.querySelector('svg').getBoundingClientRect().width,separators:rail.querySelectorAll('[role="separator"]').length};
  })()`);
  assert(
    rail.tools.join(",") === "select,pen,shapes,text,bone,mesh,constraints,hand,zoom",
    "Ferramentas diferentes da referência Pen",
  );
  assert(
    rail.width === 56 && rail.button === 38 && rail.icon === 18 && rail.separators === 2,
    "Dimensões da barra diferentes do Pen",
  );
  const drag = async (selector, dx, dy, cancel = false) => {
    const p = await js(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
    );
    win.webContents.sendInputEvent({ type: "mouseDown", ...p, button: "left", clickCount: 1 });
    win.webContents.sendInputEvent({ type: "mouseMove", x: p.x + dx, y: p.y + dy, button: "left" });
    await js("new Promise(r=>requestAnimationFrame(r))");
    if (cancel) win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    win.webContents.sendInputEvent({
      type: "mouseUp",
      x: p.x + dx,
      y: p.y + dy,
      button: "left",
      clickCount: 1,
    });
    await js("new Promise(r=>requestAnimationFrame(r))");
  };
  await click('[data-action="tool-shapes"]');
  await drag(".scene-artwork>svg", 70, 45);
  let project = await saved();
  assert(project.scene.nodes.length === 1, "Desenho n?o criou objeto");
  const initial = project.scene.nodes[0];
  assert(Number(initial.attrs.width) > 0, "Ret?ngulo sem largura");
  await drag(".scene-artwork [data-object] rect", 20, 15);
  project = await saved();
  assert(project.scene.nodes[0].transform.x > 0, "Arraste n?o moveu objeto");
  await click('[data-action="undo"]');
  assert((await saved()).scene.nodes[0].transform.x === 0, "Arraste n?o foi desfeito");
  await click('[data-action="redo"]');
  const moved = await saved();
  await drag(".scene-artwork [data-object] rect", 10, 10, true);
  assert(JSON.stringify(await saved()) === JSON.stringify(moved), "Escape alterou projeto");
  await click("[data-scene-lock]");
  const locked = await saved();
  await drag(".scene-artwork [data-object] rect", 10, 10);
  assert(JSON.stringify(await saved()) === JSON.stringify(locked), "Camada bloqueada moveu");
  await click("[data-scene-lock]");
  await click('[data-action="tool-shapes"]');
  await drag(".scene-artwork>svg", -40, -30, true);
  assert((await saved()).scene.nodes.length === 1, "Desenho cancelado foi salvo");
  await click('[data-action="tool-text"]');
  await drag(".scene-artwork>svg", 0, 0);
  assert((await saved()).scene.nodes[1].tag === "text", "Texto n?o inserido");
  await click('[data-action="tool-hand"]');
  const before = JSON.stringify(await saved());
  await drag(".stage", 30, 20);
  assert(
    await js("document.querySelector('.artboard').style.translate==='30px 20px'"),
    "Pan n?o aplicado",
  );
  assert(JSON.stringify(await saved()) === before, "Pan alterou projeto");
  await click('[data-action="tool-zoom"]');
  await drag(".stage", 0, 0);
  assert(await js("document.querySelector('#zoom').value==='100%'"), "Zoom n?o aplicado");
  await click("[data-viewport-reset]");
  assert(await js("document.querySelector('#zoom').value==='75%'"), "Centralizar falhou");
  await click("[data-scene-select]");
  await click("[data-path-enter]");
  assert((await saved()).scene.nodes[0].tag === "path", "Conversão em caminho falhou");
  assert(
    await js("document.querySelectorAll('.vertex-anchor').length===4"),
    "Vértices não apareceram",
  );
  const pathBefore = (await saved()).scene.nodes[0].attrs.d;
  await drag(".vertex-anchor.is-active", 20, 10);
  assert(
    (await saved()).scene.nodes[0].attrs.d !== pathBefore,
    "Arraste do vértice não alterou o path",
  );
  await click('[data-action="undo"]');
  assert((await saved()).scene.nodes[0].attrs.d === pathBefore, "Undo de vértice falhou");
  await click('[data-action="redo"]');
  assert((await saved()).scene.nodes[0].attrs.d !== pathBefore, "Redo de vértice falhou");
  return "draw / move / undo / redo / cancel / lock / text / pan / zoom / path conversion / vertex edit passed";
}
