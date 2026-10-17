import { CanvasEditor } from "../src/editor/canvas.js";

const results = document.getElementById("results"),
  canvas = document.getElementById("canvas");
const lines = [];
let changed = 0;
const assert = (value, label) => {
  if (!value) throw new Error(label);
  lines.push("PASS: " + label);
  results.textContent = lines.join("\n");
};
try {
  const original = document.createElement("canvas");
  original.width = 800;
  original.height = 600;
  const ctx = original.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = "black";
  ctx.fillRect(400, 200, 150, 80);
  const editor = new CanvasEditor(canvas, {
    change: () => changed++,
    selection: () => {},
    text: async () => "Anotação",
  });
  await editor.load({ dataUrl: original.toDataURL(), annotations: [] });
  const point = (x, y) => {
    const b = canvas.getBoundingClientRect();
    return { clientX: b.x + x, clientY: b.y + y, button: 0, pointerId: 1 };
  };
  // Pointer capture is a browser UI concern; model gesture coordinates still use the real DOM bounds.
  canvas.setPointerCapture = () => {};
  await editor.down(point(40, 50));
  editor.move(point(180, 140));
  editor.up();
  assert(
    editor.annotations.length === 1 &&
      editor.annotations[0].x === 80 &&
      editor.annotations[0].y2 === 280,
    "seta usa coordenadas da imagem mesmo com zoom de 50%",
  );
  editor.undo();
  assert(editor.annotations.length === 0, "desfazer remove a anotação");
  editor.redo();
  assert(editor.annotations.length === 1, "refazer restaura a anotação");
  editor.setTool("text");
  await editor.down(point(30, 25));
  assert(editor.annotations[1].text === "Anotação", "texto é inserido");
  editor.setTool("steps");
  await editor.down(point(100, 120));
  await editor.down(point(150, 160));
  assert(editor.annotations[3].number === 2, "passos incrementam");
  editor.setTool("crop");
  await editor.down(point(25, 25));
  editor.move(point(300, 250));
  editor.up();
  assert(
    editor.crop.width === 550 && editor.crop.height === 450,
    "recorte mantém coordenadas do original",
  );
  const exported = new Image();
  exported.src = editor.export();
  await exported.decode();
  assert(exported.width === 550 && exported.height === 450, "exportação aplica recorte");
  editor.undo();
  assert(!editor.crop && canvas.width === 800, "desfazer recorte restaura o original");
  editor.setTool("select");
  await editor.down(point(100, 120));
  editor.up();
  assert(editor.selected === 2, "seleção encontra passo pelo ponto");
  editor.remove();
  assert(editor.annotations.length === 3, "excluir selecionado preserva demais anotações");
  editor.setTool("blur");
  await editor.down(point(195, 95));
  editor.move(point(280, 150));
  editor.up();
  assert(editor.annotations.at(-1).kind === "blur", "pixelização é adicionada");
  const url = editor.export();
  assert(
    url.startsWith("data:image/png;base64,") && url.length > 1000,
    "canvas exporta PNG com anotações",
  );
  assert(changed >= 10, "operações notificam persistência");
  results.dataset.status = "passed";
  results.textContent += "\nTodos os testes passaram.";
} catch (error) {
  results.dataset.status = "failed";
  results.textContent = lines.join("\n") + "\nFAIL: " + error.stack;
}
