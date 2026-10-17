const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const net = require("node:net");
const root = path.resolve(__dirname, "..");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await delay(150);
  }
  throw new Error("Timeout: " + label);
}
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p?.reject(new Error(m.error.message));
        else p?.resolve(m.result);
      }
      if (m.method === "Runtime.exceptionThrown")
        this.errors.push(
          m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
        );
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const c = new CDP(ws);
    await c.call("Runtime.enable");
    await c.call("Page.enable");
    return c;
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text,
      );
    return result.result.value;
  }
  async screenshot(name) {
    const result = await this.call("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(
      path.join(root, "test-results", name + ".png"),
      Buffer.from(result.data, "base64"),
    );
  }
}
async function run() {
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  const server = net.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const env = {
    ...process.env,
    EDICAPTURA_TEST_PROFILE: path.join(root, ".test-profile", String(Date.now())),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const proc = spawn(require("electron"), [root, "--remote-debugging-port=" + port], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  proc.on("exit", (code, signal) => console.log("Electron exit:", code, signal));
  proc.on("error", (error) => console.error("Electron launch:", error));
  const connections = [];
  const targets = async () => {
    try {
      return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch {
      return [];
    }
  };
  async function page(file) {
    const target = await until(
      async () => (await targets()).find((t) => t.type === "page" && t.url.endsWith(file)),
      file,
    );
    const c = await CDP.connect(target.webSocketDebuggerUrl);
    connections.push(c);
    return c;
  }
  try {
    console.log("Connecting to Electron…");
    const editor = await page("editor/index.html");
    console.log("Editor connected");
    await until(
      () =>
        editor.eval(
          'Boolean(window.edi && document.getElementById("status-text").textContent.startsWith("EdiCaptura "))',
        ),
      "editor carregado",
    );
    const monitors = await editor.eval("edi.monitors()");
    assert.ok(monitors.displays.length > 0);
    await editor.eval(`edi.setMonitor(${JSON.stringify(monitors.displays[0].id)})`);
    assert.equal((await editor.eval("edi.monitors()")).selected, monitors.displays[0].id);
    assert.equal(await editor.eval("typeof require"), "undefined");
    assert.equal(await editor.eval('document.getElementById("empty").hidden'), false);
    await editor.screenshot("01-inicio");
    await editor.eval(
      `(async()=>{const c=document.createElement('canvas');c.width=1100;c.height=640;const x=c.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,1100,640);x.fillStyle='#f4f6fa';x.fillRect(0,0,200,640);x.fillStyle='#0062ff';x.font='bold 26px Segoe UI';x.fillText('estúdio.',30,60);x.fillStyle='#8391a7';x.font='16px Segoe UI';['Visão geral','Projetos','Equipe','Arquivos'].forEach((t,i)=>x.fillText(t,30,130+i*50));x.fillStyle='#233149';x.font='bold 32px Segoe UI';x.fillText('Redesign do website',240,70);x.fillStyle='#8792a4';x.font='16px Segoe UI';x.fillText('Um novo espaço para grandes ideias.',240,102);['A fazer','Em andamento','Em revisão'].forEach((t,i)=>{const left=240+i*280;x.fillStyle='#5c6d85';x.fillText(t,left,180);['Página inicial','Fluxo de aprovação'].forEach((title,j)=>{x.strokeStyle='#dce3ed';x.strokeRect(left,210+j*150,240,120);x.fillStyle='#0062ff';x.font='12px Segoe UI';x.fillText('DESIGN',left+18,240+j*150);x.fillStyle='#33445c';x.font='16px Segoe UI';x.fillText(title,left+18,272+j*150);});});const entry=await window.edi.save({name:'Projeto de teste',dataUrl:c.toDataURL(),annotations:[],crop:null});window.testId=entry.id;document.getElementById('library-tab').click();})()`,
    );
    await editor.eval('document.getElementById("all-captures").click()');
    // Refresh is explicit because this document was inserted through the preload for the test.
    await editor.call("Page.reload");
    await until(
      () => editor.eval('document.querySelectorAll(".recent-card").length===1'),
      "biblioteca persistida",
    );
    await editor.eval('document.querySelector(".recent-card").click()');
    await until(
      () => editor.eval('!document.getElementById("canvas-wrap").hidden'),
      "abrir projeto",
    );
    const box = await editor.eval(
      '(()=>{const r=document.getElementById("canvas").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()',
    );
    const x = box.x + box.w * 0.3,
      y = box.y + box.h * 0.65;
    await editor.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await editor.call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + 120,
      y: y - 80,
      button: "left",
      buttons: 1,
    });
    await editor.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x + 120,
      y: y - 80,
      button: "left",
      clickCount: 1,
    });
    await until(
      () =>
        editor.eval(
          "(async()=>{const entries=await edi.list();const doc=await edi.read(entries[0].id);return doc.annotations.length===1})()",
        ),
      "anotação salva",
    );
    await editor.screenshot("02-editor");
    await editor.eval('document.getElementById("undo").click()');
    await until(
      () =>
        editor.eval(
          "(async()=>{const entries=await edi.list();return (await edi.read(entries[0].id)).annotations.length===0})()",
        ),
      "desfazer",
    );
    await editor.eval('document.getElementById("redo").click()');
    await until(
      () =>
        editor.eval(
          "(async()=>{const entries=await edi.list();return (await edi.read(entries[0].id)).annotations.length===1})()",
        ),
      "refazer",
    );
    await editor.eval('document.getElementById("copy").click()');
    await until(
      () => editor.eval('document.getElementById("toast").textContent.includes("copiada")'),
      "copiar imagem",
    );
    await editor.eval("window.edi.capture()");
    const selection = await page("capture/selection.html");
    await until(
      () => selection.eval('document.getElementById("desktop").naturalWidth>0'),
      "captura do monitor",
    );
    await selection.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 120,
      y: 180,
      button: "left",
      clickCount: 1,
    });
    await selection.call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 720,
      y: 560,
      button: "left",
      buttons: 1,
    });
    await selection.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 720,
      y: 560,
      button: "left",
      clickCount: 1,
    });
    await selection.screenshot("03-selecao");
    const width = await selection.eval('Number(document.getElementById("width").value)');
    const height = await selection.eval('Number(document.getElementById("height").value)');
    await selection.eval('document.querySelector("[data-mode=image]").click()');
    await until(
      () =>
        editor.eval(
          'document.getElementById("dimensions").textContent===' +
            JSON.stringify(`${width} × ${height} px`),
        ),
      "recorte DPI",
    );
    await editor.eval("window.edi.capture()");
    const videoSelection = await page("capture/selection.html");
    await until(
      () => videoSelection.eval('document.getElementById("desktop").naturalWidth>0'),
      "seleção vídeo",
    );
    await videoSelection.eval(
      'window.edi.select({rect:{x:50,y:100,width:400,height:240},mode:"video"})',
    );
    const control = await page("recording/control.html");
    await until(
      () => control.eval('document.getElementById("title").textContent.includes("Gravando")'),
      "gravação",
    );
    assert.equal((await control.eval("edi.controlState()")).frameVisible, true);
    await delay(1600);
    await control.eval('document.getElementById("finish").click()');
    await until(
      () => editor.eval('!document.getElementById("video-preview").hidden'),
      "vídeo salvo",
      30000,
    );
    assert.equal(
      await editor.eval("(async()=>{const docs=await edi.list();return docs[0].kind})()"),
      "video",
    );
    await editor.eval("window.edi.capture()");
    const scrollSelection = await page("capture/selection.html");
    await until(
      () => scrollSelection.eval('document.getElementById("desktop").naturalWidth>0'),
      "seleção rolagem",
    );
    await scrollSelection.eval(
      'window.edi.select({rect:{x:50,y:100,width:400,height:240},mode:"scroll"})',
    );
    const scrollControl = await page("recording/control.html");
    await until(
      () => scrollControl.eval('document.getElementById("title").textContent.includes("rolagem")'),
      "controle rolagem",
    );
    await scrollControl.eval("window.edi.nextSegment()");
    const state = await scrollControl.eval("window.edi.controlState()");
    assert.equal(state.count, 1);
    assert.equal(state.frameVisible, true);
    await scrollControl.eval("window.edi.finish(null)");
    await until(
      () => editor.eval('document.getElementById("document-name").value==="Captura com rolagem"'),
      "união de trechos",
    );
    assert.ok(
      (await editor.eval('document.getElementById("dimensions").textContent')).includes(
        String(state.height),
      ),
    );
    assert.deepEqual(editor.errors, []);
    console.log(
      "PASS: inicialização, isolamento, biblioteca, anotações, desfazer/refazer, clipboard, captura real/DPI, vídeo WebM e rolagem.",
    );
    await fs.writeFile(
      path.join(root, "test-results", "smoke-report.txt"),
      "PASS: editor, sandbox, persistência, anotações, undo/redo, clipboard, screenshot/DPI, WebM, stitching.\n",
    );
  } finally {
    connections.forEach((c) => {
      c.ws.close();
    });
    proc.kill();
    await fs.writeFile(path.join(root, "test-results", "electron.log"), log);
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
