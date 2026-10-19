import { collectImageAssets, imageReferences, RasterAssets } from "../domain/assets.ts";
import { annotationSchema, viewTransformSchema } from "../domain/document.ts";

const normalize = (a, b) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});
export class CanvasEditor {
  constructor(canvas, { change, text, selection }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.change = change;
    this.askText = text;
    this.onSelection = selection;
    this.tool = "arrow";
    this.style = { color: "#0062ff", stroke: 4, opacity: 1, fontSize: 24 };
    this.annotations = [];
    this.selectedIndices = [];
    this.rasters = new Map();
    this.assets = new RasterAssets();
    this.generation = 0;
    this.viewTransform = {
      turns: 0,
      flipX: false,
      flipY: false,
      scale: 1,
      padding: 0,
      background: null,
    };
    this.crop = null;
    this.selected = -1;
    this.past = [];
    this.future = [];
    canvas.addEventListener("pointerdown", (e) =>
      this.down(e).catch((error) =>
        canvas.dispatchEvent(new CustomEvent("editor-error", { detail: error })),
      ),
    );
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => this.cancelGesture());
    canvas.addEventListener("dblclick", async (e) => {
      if (this.tool !== "select") return;
      const index = this.hit(this.point(e));
      const a = this.annotations[index];
      if (a && ["text", "callout"].includes(a.kind)) {
        this.selectIndices([index]);
        const id = a.id,
          generation = this.generation,
          text = await this.askText(a.text);
        if (text && generation === this.generation && this.annotations[this.selected]?.id === id)
          this.editText(text);
      }
    });
  }
  cancelGesture() {
    if (this.drag?.kind === "move")
      this.drag.indices.forEach((index, i) => {
        this.annotations[index] = this.drag.originals[i];
      });
    if (this.drag?.kind === "resize") this.annotations[this.selected] = this.drag.original;
    this.drag = null;
    this.preview = null;
    this.draw();
  }
  cancelInteraction() {
    this.generation++;
    this.cancelGesture();
  }
  async prepare(doc) {
    const image = new Image();
    image.src = doc.dataUrl;
    await image.decode();
    if (image.width * image.height > 100_000_000)
      throw new Error("Imagem maior que 100 megapixels.");
    const { imageEditSchema } = await import("../domain/document.ts");
    const edits = imageEditSchema.parse({
      annotations: doc.annotations || [],
      crop: doc.crop || null,
      viewTransform: doc.viewTransform,
    });
    if (
      edits.crop &&
      (edits.crop.x + edits.crop.width > image.width ||
        edits.crop.y + edits.crop.height > image.height)
    )
      throw new Error("Recorte fora da imagem original.");
    const sources = collectImageAssets(edits.annotations, doc.assets);
    const assets = new RasterAssets(sources, true);
    const rasters = new Map();
    let rasterPixels = image.width * image.height;
    for (const annotation of edits.annotations)
      if (annotation.kind === "image") {
        const source = sources.get(annotation.assetId);
        if (!source) throw new Error("Imagem de composição não encontrada.");
        if (rasters.has(annotation.assetId)) continue;
        const raster = new Image();
        raster.src = source;
        await raster.decode();
        if (raster.width * raster.height > 100_000_000)
          throw new Error("Imagem de composição muito grande.");
        rasterPixels += raster.width * raster.height;
        if (rasterPixels > 100_000_000)
          throw new Error("Composição excede o orçamento de 100 megapixels.");
        rasters.set(annotation.assetId, raster);
      }
    const bounds = edits.crop || { width: image.width, height: image.height },
      t = edits.viewTransform;
    const width =
        (t.turns % 2 ? bounds.height : bounds.width) * t.scale +
        (t.padding + (t.borderWidth || 0)) * 2,
      height =
        (t.turns % 2 ? bounds.width : bounds.height) * t.scale +
        (t.padding + (t.borderWidth || 0)) * 2;
    if (
      Math.round(width) < 1 ||
      Math.round(height) < 1 ||
      width * height > 100_000_000 ||
      width > 30000 ||
      height > 30000
    )
      throw new Error("Imagem transformada excede o limite.");
    return {
      image,
      annotations: imageReferences(edits.annotations).map((a) => ({
        ...a,
        id: a.id || crypto.randomUUID(),
      })),
      crop: edits.crop,
      viewTransform: edits.viewTransform,
      rasters,
      assets,
    };
  }
  activate(prepared) {
    this.image = prepared.image;
    this.annotations = prepared.annotations;
    this.crop = prepared.crop;
    this.viewTransform = prepared.viewTransform;
    this.rasters = prepared.rasters;
    this.assets = prepared.assets;
    this.selectedIndices = [];
    this.generation++;
    this.drag = null;
    this.preview = null;
    this.past = [];
    this.future = [];
    this.selected = -1;
    this.draw();
    this.onSelection(null);
  }
  async load(doc) {
    this.activate(await this.prepare(doc));
  }
  clear() {
    this.generation++;
    this.image = null;
    this.annotations = [];
    this.assets = new RasterAssets();
    this.rasters = new Map();
    this.past = [];
    this.future = [];
    this.selected = -1;
    this.selectedIndices = [];
    this.drag = null;
    this.preview = null;
    this.onSelection(null);
  }
  bounds() {
    return (
      this.crop || { x: 0, y: 0, width: this.image?.width || 1, height: this.image?.height || 1 }
    );
  }
  snapshot() {
    return JSON.stringify({
      annotations: this.annotations,
      crop: this.crop,
      viewTransform: this.viewTransform,
    });
  }
  remember(snapshot) {
    this.past.push(snapshot);
    while (
      this.past.length > 60 ||
      (this.past.length > 1 && this.past.reduce((size, item) => size + item.length, 0) > 8_000_000)
    )
      this.past.shift();
  }
  checkpoint() {
    this.remember(this.snapshot());
    this.future = [];
  }
  undo() {
    if (!this.past.length) return;
    this.future.push(this.snapshot());
    this.restore(this.past.pop());
  }
  redo() {
    if (!this.future.length) return;
    this.remember(this.snapshot());
    this.restore(this.future.pop());
  }
  restore(json) {
    Object.assign(this, JSON.parse(json));
    this.selected = -1;
    this.selectedIndices = [];
    this.onSelection(null);
    this.draw();
    this.change();
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect(),
      b = this.bounds();
    const t = this.viewTransform,
      rotatedWidth = t.turns % 2 ? b.height : b.width,
      rotatedHeight = t.turns % 2 ? b.width : b.height;
    let x =
      (((e.clientX - r.left) * this.canvas.width) / r.width - t.padding - (t.borderWidth || 0)) /
      t.scale;
    let y =
      (((e.clientY - r.top) * this.canvas.height) / r.height - t.padding - (t.borderWidth || 0)) /
      t.scale;
    if (t.flipX) x = rotatedWidth - x;
    if (t.flipY) y = rotatedHeight - y;
    [x, y] =
      t.turns === 1
        ? [y, b.height - x]
        : t.turns === 2
          ? [b.width - x, b.height - y]
          : t.turns === 3
            ? [b.width - y, x]
            : [x, y];
    return {
      x: b.x + Math.max(0, Math.min(b.width, x)),
      y: b.y + Math.max(0, Math.min(b.height, y)),
    };
  }
  setTool(tool) {
    this.tool = tool;
    this.selected = -1;
    this.selectedIndices = [];
    this.onSelection(null);
    this.canvas.style.cursor = tool === "select" ? "default" : "crosshair";
    this.draw();
  }
  box(a) {
    if (a.kind === "text") {
      this.ctx.font = `600 ${a.fontSize}px "Segoe UI",sans-serif`;
      return {
        x: a.x,
        y: a.y,
        width: Math.max(1, ...a.text.split("\n").map((line) => this.ctx.measureText(line).width)),
        height: a.fontSize * 1.35 * a.text.split("\n").length,
      };
    }
    if (a.kind === "steps") {
      const radius = a.radius || 18;
      return { x: a.x - radius, y: a.y - radius, width: radius * 2, height: radius * 2 };
    }
    if (a.kind === "pen") {
      const xs = a.points.map((p) => p.x),
        ys = a.points.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    }
    return normalize({ x: a.x, y: a.y }, { x: a.x2, y: a.y2 });
  }
  hit(p) {
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const a = this.annotations[i],
        b = this.box(a),
        angle = (-(a.rotation || 0) * Math.PI) / 180,
        dx = p.x - b.x - b.width / 2,
        dy = p.y - b.y - b.height / 2;
      const local = {
        x: b.x + b.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: b.y + b.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
      };
      if (a.kind === "arrow" || a.kind === "line") {
        const vx = a.x2 - a.x,
          vy = a.y2 - a.y,
          t = Math.max(
            0,
            Math.min(1, ((local.x - a.x) * vx + (local.y - a.y) * vy) / (vx * vx + vy * vy || 1)),
          );
        if (Math.hypot(local.x - a.x - t * vx, local.y - a.y - t * vy) <= Math.max(8, a.stroke))
          return i;
        continue;
      }
      if (
        local.x >= b.x - 8 &&
        local.y >= b.y - 8 &&
        local.x <= b.x + b.width + 8 &&
        local.y <= b.y + b.height + 8
      )
        return i;
    }
    return -1;
  }
  async down(e) {
    if (!this.image || e.button !== 0) return;
    const p = this.point(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (this.tool === "select" && this.selected >= 0) {
      const b = this.box(this.annotations[this.selected]);
      if (Math.hypot(p.x - b.x - b.width, p.y - b.y - b.height) < 10) {
        this.drag = {
          kind: "resize",
          original: structuredClone(this.annotations[this.selected]),
          box: b,
          before: this.snapshot(),
        };
        return;
      }
    }
    if (this.tool === "text") {
      const generation = this.generation;
      const text = await this.askText();
      if (text && generation === this.generation) {
        this.checkpoint();
        this.annotations.push({ id: crypto.randomUUID(), kind: "text", ...p, ...this.style, text });
        this.draw();
        this.change();
      }
      return;
    }
    if (this.tool === "steps") {
      if (this.annotations.length >= 1000) throw new Error("Limite de 1000 objetos atingido.");
      const number = this.nextStepNumber();
      this.checkpoint();
      this.annotations.push({
        kind: "steps",
        id: crypto.randomUUID(),
        ...p,
        ...this.style,
        number,
      });
      this.draw();
      this.change();
      return;
    }
    if (this.tool === "select" || this.tool === "eraser") {
      const hit = this.hit(p);
      if (hit >= 0 && e.shiftKey) this.selectIndices([...this.selectionIndices(), hit]);
      else if (hit >= 0 && this.annotations[hit].groupId)
        this.selectIndices(
          this.annotations.flatMap((a, i) =>
            a.groupId === this.annotations[hit].groupId ? [i] : [],
          ),
        );
      else if (hit >= 0 && this.selectionIndices().includes(hit)) this.selected = hit;
      else this.selectIndices(hit >= 0 ? [hit] : []);
      this.onSelection(this.annotations[this.selected] || null);
      if (this.tool === "eraser") {
        this.remove();
        return;
      }
      if (this.selected >= 0)
        this.drag = {
          kind: "move",
          start: p,
          original: structuredClone(this.annotations[this.selected]),
          before: this.snapshot(),
          indices: this.selectionIndices(),
          originals: this.selectionIndices().map((i) => structuredClone(this.annotations[i])),
        };
      this.draw();
      return;
    }
    this.drag = { kind: "draw", start: p };
    this.preview = {
      id: crypto.randomUUID(),
      text: this.tool === "callout" ? "Anotação" : undefined,
      factor: 2,
      kind: this.tool,
      ...this.style,
      x: p.x,
      y: p.y,
      x2: p.x,
      y2: p.y,
      points: [p],
    };
  }
  move(e) {
    if (!this.drag) return;
    let p = this.point(e);
    if (this.drag.kind === "resize") {
      const a = structuredClone(this.drag.original),
        b = this.drag.box,
        width = Math.max(["arrow", "line"].includes(a.kind) ? 0 : 2, p.x - b.x),
        height = Math.max(["arrow", "line"].includes(a.kind) ? 0 : 2, p.y - b.y);
      if (width === 0 && height === 0) return;
      if (a.kind === "text")
        a.fontSize = Math.max(8, Math.min(256, (a.fontSize * height) / b.height));
      else if (a.kind === "steps")
        a.radius = Math.max(4, Math.min(300, Math.min(width, height) / 2));
      else if (a.points)
        a.points = a.points.map((point) => ({
          x: b.x + ((point.x - b.x) * width) / (b.width || 1),
          y: b.y + ((point.y - b.y) * height) / (b.height || 1),
        }));
      else {
        const forwardX = a.x2 >= a.x,
          forwardY = a.y2 >= a.y;
        a.x = forwardX ? b.x : b.x + width;
        a.x2 = forwardX ? b.x + width : b.x;
        a.y = forwardY ? b.y : b.y + height;
        a.y2 = forwardY ? b.y + height : b.y;
      }
      this.annotations[this.selected] = a;
      this.draw();
      return;
    }
    if (this.drag.kind === "move") {
      const dx = p.x - this.drag.start.x,
        dy = p.y - this.drag.start.y;
      this.drag.indices.forEach((index, i) => {
        this.annotations[index] = this.translated(this.drag.originals[i], dx, dy);
      });
    } else {
      const a = this.preview;
      if (e.shiftKey && a.kind === "arrow") {
        const dx = p.x - a.x,
          dy = p.y - a.y,
          angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
          len = Math.hypot(dx, dy);
        p = { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len };
      }
      a.x2 = p.x;
      a.y2 = p.y;
      if (a.kind === "pen" && a.points.length < 20000) a.points.push(p);
    }
    this.draw();
  }
  up() {
    if (!this.drag) return;
    if (this.drag.kind === "move" || this.drag.kind === "resize") {
      if (this.snapshot() !== this.drag.before) {
        this.remember(this.drag.before);
        this.future = [];
        this.change();
      }
    } else if (this.preview) {
      const a = this.preview,
        b = this.box(a);
      if (b.width >= 2 || b.height >= 2) {
        if (a.kind === "callout") a.text = "Anotação";
        if (a.kind === "magnify") a.factor = 2;
        if (a.kind === "crop") {
          if (b.width >= 2 && b.height >= 2) {
            const bounds = this.bounds(),
              left = Math.max(bounds.x, Math.min(bounds.x + bounds.width - 1, Math.round(b.x))),
              top = Math.max(bounds.y, Math.min(bounds.y + bounds.height - 1, Math.round(b.y))),
              right = Math.max(
                left + 1,
                Math.min(bounds.x + bounds.width, Math.round(b.x + b.width)),
              ),
              bottom = Math.max(
                top + 1,
                Math.min(bounds.y + bounds.height, Math.round(b.y + b.height)),
              );
            this.checkpoint();
            this.crop = {
              x: left,
              y: top,
              width: right - left,
              height: bottom - top,
            };
            this.change();
          }
        } else {
          this.checkpoint();
          this.annotations.push(a);
          this.change();
        }
      }
    }
    this.drag = null;
    this.preview = null;
    this.draw();
  }
  remove() {
    if (this.selected < 0) return;
    this.checkpoint();
    const indices = new Set(this.selectionIndices());
    this.annotations = this.annotations.filter((_a, i) => !indices.has(i));
    this.selected = -1;
    this.selectedIndices = [];
    this.onSelection(null);
    this.draw();
    this.change();
  }
  updateStyle(part) {
    Object.assign(this.style, part);
    if (this.selected >= 0) {
      this.checkpoint();
      for (const index of this.selectionIndices()) Object.assign(this.annotations[index], part);
      this.draw();
      this.change();
    }
  }
  resetCrop() {
    if (!this.crop) return;
    this.checkpoint();
    this.crop = null;
    this.draw();
    this.change();
  }
  paint(ctx, a) {
    ctx.save();
    ctx.globalAlpha = a.opacity;
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = a.stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const b = this.box(a);
    if (a.rotation) {
      ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
      ctx.rotate((a.rotation * Math.PI) / 180);
      ctx.translate(-b.x - b.width / 2, -b.y - b.height / 2);
    }
    if (a.shadow) {
      ctx.shadowColor = "#00000055";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }
    if (a.kind === "arrow") {
      const angle = Math.atan2(a.y2 - a.y, a.x2 - a.x),
        head = Math.max(14, a.stroke * 4);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      const tip = (x, y, angle) => {
        ctx.beginPath();
        ctx.moveTo(
          x - head * Math.cos(angle - Math.PI / 6),
          y - head * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(x, y);
        ctx.lineTo(
          x - head * Math.cos(angle + Math.PI / 6),
          y - head * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      };
      if (a.arrowHeads !== "none") tip(a.x2, a.y2, angle);
      if (a.arrowHeads === "both") tip(a.x, a.y, angle + Math.PI);
    } else if (a.kind === "square") {
      if (a.fill) {
        ctx.fillStyle = a.fill;
        ctx.fillRect(b.x, b.y, b.width, b.height);
      }
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    } else if (a.kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        b.x + b.width / 2,
        b.y + b.height / 2,
        b.width / 2,
        b.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (a.fill) {
        ctx.fillStyle = a.fill;
        ctx.fill();
      }
      ctx.stroke();
    } else if (a.kind === "line") {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
    } else if (a.kind === "callout") {
      ctx.fillStyle = a.fill || "#ffffff";
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.beginPath();
      ctx.moveTo(b.x + 15, b.y + b.height);
      ctx.lineTo(b.x + 10, b.y + b.height + 14);
      ctx.lineTo(b.x + 35, b.y + b.height);
      ctx.stroke();
      ctx.fillStyle = a.color;
      ctx.font = `600 ${a.fontSize}px "Segoe UI",sans-serif`;
      ctx.textBaseline = "top";
      a.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, b.x + 6, b.y + 6 + i * a.fontSize * 1.35, b.width - 12);
      });
    } else if (a.kind === "redact") {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#000000";
      ctx.fillRect(b.x, b.y, b.width, b.height);
    } else if (a.kind === "image") {
      const image = this.rasters.get(a.assetId);
      if (image) ctx.drawImage(image, b.x, b.y, b.width, b.height);
    } else if (a.kind === "spotlight") {
      const bounds = this.bounds();
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      ctx.rect(b.x, b.y, b.width, b.height);
      ctx.fill("evenodd");
    } else if (a.kind === "magnify") {
      const crop = this.bounds();
      const sx = Math.max(0, b.x - crop.x),
        sy = Math.max(0, b.y - crop.y);
      const piece = document.createElement("canvas");
      piece.width = Math.ceil(b.width);
      piece.height = Math.ceil(b.height);
      piece
        .getContext("2d")
        .drawImage(ctx.canvas, sx, sy, b.width, b.height, 0, 0, b.width, b.height);
      ctx.drawImage(piece, b.x, b.y, b.width * a.factor, b.height * a.factor);
      ctx.strokeRect(b.x, b.y, b.width * a.factor, b.height * a.factor);
    } else if (a.kind === "highlighter") {
      ctx.globalAlpha = a.opacity * 0.3;
      ctx.fillRect(b.x, b.y, b.width, b.height);
    } else if (a.kind === "text") {
      ctx.font = `600 ${a.fontSize}px "Segoe UI",sans-serif`;
      ctx.textBaseline = "top";
      a.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, a.x, a.y + i * a.fontSize * 1.35);
      });
    } else if (a.kind === "steps") {
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius || 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${a.radius || 18}px "Segoe UI"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(a.number, a.x, a.y);
    } else if (a.kind === "pen") {
      ctx.beginPath();
      a.points.forEach((p, i) => {
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
    } else if (a.kind === "blur") {
      const crop = this.bounds(),
        x = Math.max(0, b.x - crop.x),
        y = Math.max(0, b.y - crop.y),
        w = Math.min(b.width, ctx.canvas.width - x),
        h = Math.min(b.height, ctx.canvas.height - y);
      if (w > 0 && h > 0) {
        const mini = document.createElement("canvas");
        mini.width = Math.max(1, Math.ceil(w / 14));
        mini.height = Math.max(1, Math.ceil(h / 14));
        mini.getContext("2d").drawImage(ctx.canvas, x, y, w, h, 0, 0, mini.width, mini.height);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1;
        ctx.drawImage(mini, 0, 0, mini.width, mini.height, x + crop.x, y + crop.y, w, h);
      }
    } else if (a.kind === "crop") {
      ctx.strokeStyle = "#0062ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#0062ff";
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }
    ctx.restore();
  }
  renderTo(canvas, selection = false) {
    if (!this.image) return;
    const b = this.bounds();
    const scene = document.createElement("canvas");
    scene.width = b.width;
    scene.height = b.height;
    const ctx = scene.getContext("2d");
    ctx.drawImage(this.image, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    ctx.save();
    ctx.translate(-b.x, -b.y);
    const redactions = this.annotations.filter((a) => a.kind === "redact");
    for (const a of this.annotations.filter((a) => a.kind !== "redact")) {
      if (a.kind === "magnify") for (const mask of redactions) this.paint(ctx, mask);
      this.paint(ctx, a);
    }
    for (const mask of redactions) this.paint(ctx, mask);
    if (selection && this.preview) this.paint(ctx, this.preview);
    if (selection && this.selected >= 0)
      for (const index of this.selectionIndices()) {
        const box = this.box(this.annotations[index]);
        ctx.strokeStyle = "#0062ff";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(box.x - 6, box.y - 6, box.width + 12, box.height + 12);
        ctx.fillStyle = "#0062ff";
        ctx.fillRect(box.x + box.width - 4, box.y + box.height - 4, 8, 8);
      }
    ctx.restore();
    const t = this.viewTransform,
      size = this.displaySize();
    canvas.width = size.width;
    canvas.height = size.height;
    const output = canvas.getContext("2d");
    if (t.background) {
      output.fillStyle = t.background;
      output.fillRect(0, 0, canvas.width, canvas.height);
    }
    output.save();
    output.translate(t.padding + (t.borderWidth || 0), t.padding + (t.borderWidth || 0));
    output.scale(t.scale, t.scale);
    const width = t.turns % 2 ? b.height : b.width,
      height = t.turns % 2 ? b.width : b.height;
    if (t.flipX) {
      output.translate(width, 0);
      output.scale(-1, 1);
    }
    if (t.flipY) {
      output.translate(0, height);
      output.scale(1, -1);
    }
    if (t.turns === 1) output.translate(b.height, 0);
    else if (t.turns === 2) output.translate(b.width, b.height);
    else if (t.turns === 3) output.translate(0, b.width);
    output.rotate((t.turns * Math.PI) / 2);
    output.drawImage(scene, 0, 0);
    output.restore();
    if (t.borderWidth) {
      output.strokeStyle = t.borderColor;
      output.lineWidth = t.borderWidth;
      output.strokeRect(
        t.borderWidth / 2,
        t.borderWidth / 2,
        canvas.width - t.borderWidth,
        canvas.height - t.borderWidth,
      );
    }
  }
  draw() {
    this.renderTo(this.canvas, true);
  }
  export(options = {}) {
    const canvas = document.createElement("canvas");
    this.renderTo(canvas);
    const output = document.createElement("canvas");
    output.width = options.width || canvas.width;
    output.height =
      options.height || Math.max(1, Math.round((canvas.height * output.width) / canvas.width));
    if (output.width * output.height > 100_000_000 || output.width > 30000 || output.height > 30000)
      throw new Error("Exportação excede o limite de tamanho.");
    const ctx = output.getContext("2d");
    if (options.background) {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, output.width, output.height);
    }
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    return output.toDataURL(options.format || "image/png", options.quality ?? 0.92);
  }
  displaySize() {
    const b = this.bounds(),
      t = this.viewTransform;
    return {
      width:
        Math.round((t.turns % 2 ? b.height : b.width) * t.scale) +
        (t.padding + (t.borderWidth || 0)) * 2,
      height:
        Math.round((t.turns % 2 ? b.width : b.height) * t.scale) +
        (t.padding + (t.borderWidth || 0)) * 2,
    };
  }
  setViewTransform(part) {
    const candidate = viewTransformSchema.parse({ ...this.viewTransform, ...part });
    const b = this.bounds();
    const w =
        (candidate.turns % 2 ? b.height : b.width) * candidate.scale +
        (candidate.padding + candidate.borderWidth) * 2,
      h =
        (candidate.turns % 2 ? b.width : b.height) * candidate.scale +
        (candidate.padding + candidate.borderWidth) * 2;
    if (Math.round(w) < 1 || Math.round(h) < 1 || w * h > 100_000_000 || w > 30000 || h > 30000)
      throw new Error("Imagem transformada excede o limite.");
    this.checkpoint();
    this.viewTransform = candidate;
    this.draw();
    this.change();
  }
  selectionIndices() {
    return this.selected < 0
      ? []
      : this.selectedIndices.includes(this.selected)
        ? this.selectedIndices
        : [this.selected];
  }
  selectIndices(indices) {
    this.selectedIndices = [...new Set(indices)].filter(
      (i) => i >= 0 && i < this.annotations.length,
    );
    this.selected = this.selectedIndices.at(-1) ?? -1;
    this.onSelection(this.annotations[this.selected] || null);
    this.draw();
  }
  addAnnotation(kind, part) {
    if (this.annotations.length >= 1000) throw new Error("Limite de 1000 objetos atingido.");
    this.checkpoint();
    const a = annotationSchema.parse({
      ...this.style,
      id: crypto.randomUUID(),
      kind,
      x: 10,
      y: 10,
      x2: 80,
      y2: 60,
      rotation: 0,
      fill: null,
      shadow: false,
      ...part,
    });
    this.annotations.push(a);
    this.selectIndices([this.annotations.length - 1]);
    this.change();
    return a;
  }
  translated(annotation, dx, dy) {
    const a = structuredClone(annotation);
    a.x += dx;
    a.y += dy;
    if (a.x2 !== undefined) {
      a.x2 += dx;
      a.y2 += dy;
    }
    if (a.points) a.points = a.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    return a;
  }
  moveSelection(dx, dy) {
    if (this.selected < 0) return;
    this.checkpoint();
    for (const i of this.selectionIndices())
      this.annotations[i] = this.translated(this.annotations[i], dx, dy);
    this.draw();
    this.change();
  }
  editText(text) {
    const a = this.annotations[this.selected];
    if (!a || !["text", "callout"].includes(a.kind) || !text.trim()) return;
    this.checkpoint();
    a.text = text;
    this.draw();
    this.change();
  }
  nextStepNumber(
    used = new Set(this.annotations.filter((a) => a.kind === "steps").map((a) => a.number)),
  ) {
    let number = Math.max(0, ...used) + 1;
    if (number > 1000) {
      number = 1;
      while (used.has(number) && number <= 1000) number++;
    }
    if (number > 1000) throw new Error("Limite de 1000 passos atingido.");
    used.add(number);
    return number;
  }
  duplicateSelection() {
    if (this.selected < 0) return;
    if (this.annotations.length + this.selectionIndices().length > 1000)
      throw new Error("Limite de 1000 objetos atingido.");
    const usedSteps = new Set(
      this.annotations.filter((a) => a.kind === "steps").map((a) => a.number),
    );
    const groupMap = new Map(),
      copies = this.selectionIndices().map((i) => {
        const a = this.translated(this.annotations[i], 12, 12);
        a.id = crypto.randomUUID();
        if (a.kind === "steps") a.number = this.nextStepNumber(usedSteps);
        if (a.groupId) {
          if (!groupMap.has(a.groupId)) groupMap.set(a.groupId, crypto.randomUUID());
          a.groupId = groupMap.get(a.groupId);
        }
        return a;
      });
    this.checkpoint();
    const start = this.annotations.length;
    this.annotations.push(...copies);
    this.selectIndices(copies.map((_a, i) => start + i));
    this.change();
  }
  group() {
    if (this.selectionIndices().length < 2) return;
    this.checkpoint();
    const id = crypto.randomUUID();
    for (const i of this.selectionIndices()) this.annotations[i].groupId = id;
    this.change();
  }
  ungroup() {
    if (this.selected < 0) return;
    this.checkpoint();
    for (const i of this.selectionIndices()) delete this.annotations[i].groupId;
    this.change();
  }
  alignSelection(direction) {
    const indices = this.selectionIndices();
    if (indices.length < 2) return;
    this.checkpoint();
    const boxes = indices.map((i) => this.box(this.annotations[i]));
    const left = Math.min(...boxes.map((b) => b.x)),
      top = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    indices.forEach((i, index) => {
      const b = boxes[index];
      const dx =
        direction === "left"
          ? left - b.x
          : direction === "right"
            ? right - b.x - b.width
            : direction === "center"
              ? (left + right - b.width) / 2 - b.x
              : 0;
      const dy =
        direction === "top"
          ? top - b.y
          : direction === "bottom"
            ? bottom - b.y - b.height
            : direction === "middle"
              ? (top + bottom - b.height) / 2 - b.y
              : 0;
      this.annotations[i] = this.translated(this.annotations[i], dx, dy);
    });
    this.draw();
    this.change();
  }
  reorderSelection(direction) {
    if (this.selected < 0) return;
    this.checkpoint();
    const selected = new Set(this.selectionIndices()),
      objects = this.annotations.filter((_a, i) => selected.has(i)),
      rest = this.annotations.filter((_a, i) => !selected.has(i));
    this.annotations = direction === "front" ? [...rest, ...objects] : [...objects, ...rest];
    this.selectIndices(objects.map((a) => this.annotations.indexOf(a)));
    this.change();
  }
  resizeSelection(width, height) {
    const a = this.annotations[this.selected];
    if (
      !a ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 0 ||
      height < 0 ||
      (["arrow", "line"].includes(a.kind) ? width === 0 && height === 0 : width < 1 || height < 1)
    )
      return;
    this.checkpoint();
    const b = this.box(a);
    if (a.kind === "steps") a.radius = Math.max(4, Math.min(300, Math.min(width, height) / 2));
    else if (a.kind === "text")
      a.fontSize = Math.max(8, Math.min(256, (a.fontSize * height) / b.height));
    else if (a.points)
      a.points = a.points.map((p) => ({
        x: b.x + ((p.x - b.x) * width) / (b.width || 1),
        y: b.y + ((p.y - b.y) * height) / (b.height || 1),
      }));
    else {
      const forwardX = a.x2 >= a.x,
        forwardY = a.y2 >= a.y;
      a.x = forwardX ? b.x : b.x + width;
      a.x2 = forwardX ? b.x + width : b.x;
      a.y = forwardY ? b.y : b.y + height;
      a.y2 = forwardY ? b.y + height : b.y;
    }
    this.draw();
    this.change();
  }
  async addImage(dataUrl) {
    if (this.annotations.length >= 1000) throw new Error("Limite de 1000 objetos atingido.");
    const generation = this.generation;
    let existing = this.assets.find(dataUrl);
    const image = existing ? this.rasters.get(existing) : new Image();
    if (!existing) {
      image.src = dataUrl;
      await image.decode();
    }
    if (generation !== this.generation) throw new Error("Documento mudou durante a importação.");
    if (this.annotations.length >= 1000) throw new Error("Limite de 1000 objetos atingido.");
    existing = this.assets.find(dataUrl);
    if (image.width * image.height > 100_000_000) throw new Error("Imagem muito grande.");
    if (
      (existing ? 0 : image.width * image.height) +
        this.image.width * this.image.height +
        [...this.rasters.values()].reduce(
          (pixels, raster) => pixels + raster.width * raster.height,
          0,
        ) >
      100_000_000
    )
      throw new Error("Composição excede o orçamento de 100 megapixels.");
    const assetId = existing || crypto.randomUUID();
    this.assets.add(assetId, dataUrl);
    this.rasters.set(assetId, image);
    const b = this.bounds(),
      scale = Math.min(1, b.width / image.width, b.height / image.height);
    this.addAnnotation("image", {
      assetId,
      x: b.x,
      y: b.y,
      x2: b.x + image.width * scale,
      y2: b.y + image.height * scale,
    });
  }
  cutout(axis, start, length) {
    const source = document.createElement("canvas");
    this.renderTo(source);
    const limit = axis === "x" ? source.width : source.height;
    if (
      !["x", "y"].includes(axis) ||
      !Number.isInteger(start) ||
      !Number.isInteger(length) ||
      start < 0 ||
      length < 1 ||
      start + length >= limit
    )
      throw new Error("Faixa inválida. Preserve ao menos um pixel após a faixa.");
    const result = document.createElement("canvas");
    result.width = source.width - (axis === "x" ? length : 0);
    result.height = source.height - (axis === "y" ? length : 0);
    const ctx = result.getContext("2d");
    if (axis === "x") {
      if (start > 0) ctx.drawImage(source, 0, 0, start, source.height, 0, 0, start, source.height);
      ctx.drawImage(
        source,
        start + length,
        0,
        limit - start - length,
        source.height,
        start,
        0,
        limit - start - length,
        source.height,
      );
    } else {
      if (start > 0) ctx.drawImage(source, 0, 0, source.width, start, 0, 0, source.width, start);
      ctx.drawImage(
        source,
        0,
        start + length,
        source.width,
        limit - start - length,
        0,
        start,
        source.width,
        limit - start - length,
      );
    }
    return result.toDataURL("image/png");
  }
}
