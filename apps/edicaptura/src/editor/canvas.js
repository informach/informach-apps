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
    this.crop = null;
    this.selected = -1;
    this.past = [];
    this.future = [];
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => {
      if (this.drag?.kind === "move") this.annotations[this.selected] = this.drag.original;
      this.drag = null;
      this.preview = null;
      this.draw();
    });
  }
  async load(doc) {
    const image = new Image();
    image.src = doc.dataUrl;
    await image.decode();
    if (image.width * image.height > 100_000_000)
      throw new Error("Imagem maior que 100 megapixels.");
    this.image = image;
    this.annotations = structuredClone(doc.annotations || []);
    this.crop = doc.crop || null;
    this.past = [];
    this.future = [];
    this.selected = -1;
    this.draw();
    this.onSelection(null);
  }
  bounds() {
    return (
      this.crop || { x: 0, y: 0, width: this.image?.width || 1, height: this.image?.height || 1 }
    );
  }
  snapshot() {
    return JSON.stringify({ annotations: this.annotations, crop: this.crop });
  }
  checkpoint() {
    this.past.push(this.snapshot());
    if (this.past.length > 60) this.past.shift();
    this.future = [];
  }
  undo() {
    if (!this.past.length) return;
    this.future.push(this.snapshot());
    this.restore(this.past.pop());
  }
  redo() {
    if (!this.future.length) return;
    this.past.push(this.snapshot());
    this.restore(this.future.pop());
  }
  restore(json) {
    Object.assign(this, JSON.parse(json));
    this.selected = -1;
    this.onSelection(null);
    this.draw();
    this.change();
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect(),
      b = this.bounds();
    return {
      x: Math.max(b.x, Math.min(b.x + b.width, b.x + ((e.clientX - r.left) * b.width) / r.width)),
      y: Math.max(b.y, Math.min(b.y + b.height, b.y + ((e.clientY - r.top) * b.height) / r.height)),
    };
  }
  setTool(tool) {
    this.tool = tool;
    this.selected = -1;
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
        width: this.ctx.measureText(a.text).width,
        height: a.fontSize * 1.35,
      };
    }
    if (a.kind === "steps") return { x: a.x - 18, y: a.y - 18, width: 36, height: 36 };
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
      const b = this.box(this.annotations[i]);
      if (p.x >= b.x - 8 && p.y >= b.y - 8 && p.x <= b.x + b.width + 8 && p.y <= b.y + b.height + 8)
        return i;
    }
    return -1;
  }
  async down(e) {
    if (!this.image || e.button !== 0) return;
    const p = this.point(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (this.tool === "text") {
      const text = await this.askText();
      if (text) {
        this.checkpoint();
        this.annotations.push({ kind: "text", ...p, ...this.style, text });
        this.draw();
        this.change();
      }
      return;
    }
    if (this.tool === "steps") {
      this.checkpoint();
      this.annotations.push({
        kind: "steps",
        ...p,
        ...this.style,
        number: this.annotations.filter((a) => a.kind === "steps").length + 1,
      });
      this.draw();
      this.change();
      return;
    }
    if (this.tool === "select" || this.tool === "eraser") {
      this.selected = this.hit(p);
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
        };
      this.draw();
      return;
    }
    this.drag = { kind: "draw", start: p };
    this.preview = {
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
    if (this.drag.kind === "move") {
      const a = structuredClone(this.drag.original),
        dx = p.x - this.drag.start.x,
        dy = p.y - this.drag.start.y;
      a.x += dx;
      a.y += dy;
      if (a.x2 !== undefined) {
        a.x2 += dx;
        a.y2 += dy;
      }
      if (a.points) a.points = a.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      this.annotations[this.selected] = a;
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
    if (this.drag.kind === "move") {
      if (this.snapshot() !== this.drag.before) {
        this.past.push(this.drag.before);
        this.future = [];
        this.change();
      }
    } else if (this.preview) {
      const a = this.preview,
        b = this.box(a);
      if (b.width >= 2 || b.height >= 2) {
        if (a.kind === "crop") {
          if (b.width >= 2 && b.height >= 2) {
            this.checkpoint();
            this.crop = {
              x: Math.round(b.x),
              y: Math.round(b.y),
              width: Math.round(b.width),
              height: Math.round(b.height),
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
    this.annotations.splice(this.selected, 1);
    this.selected = -1;
    this.onSelection(null);
    this.draw();
    this.change();
  }
  updateStyle(part) {
    Object.assign(this.style, part);
    if (this.selected >= 0) {
      this.checkpoint();
      Object.assign(this.annotations[this.selected], part);
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
    if (a.kind === "arrow") {
      const angle = Math.atan2(a.y2 - a.y, a.x2 - a.x),
        head = Math.max(14, a.stroke * 4);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(
        a.x2 - head * Math.cos(angle - Math.PI / 6),
        a.y2 - head * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(a.x2, a.y2);
      ctx.lineTo(
        a.x2 - head * Math.cos(angle + Math.PI / 6),
        a.y2 - head * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    } else if (a.kind === "square") {
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    } else if (a.kind === "highlighter") {
      ctx.globalAlpha = a.opacity * 0.3;
      ctx.fillRect(b.x, b.y, b.width, b.height);
    } else if (a.kind === "text") {
      ctx.font = `600 ${a.fontSize}px "Segoe UI",sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(a.text, a.x, a.y);
    } else if (a.kind === "steps") {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 18px "Segoe UI"';
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
    canvas.width = b.width;
    canvas.height = b.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(this.image, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    ctx.save();
    ctx.translate(-b.x, -b.y);
    for (const a of this.annotations) this.paint(ctx, a);
    if (selection && this.preview) this.paint(ctx, this.preview);
    if (selection && this.selected >= 0) {
      const box = this.box(this.annotations[this.selected]);
      ctx.strokeStyle = "#0062ff";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(box.x - 6, box.y - 6, box.width + 12, box.height + 12);
    }
    ctx.restore();
  }
  draw() {
    this.renderTo(this.canvas, true);
  }
  export() {
    const canvas = document.createElement("canvas");
    this.renderTo(canvas);
    return canvas.toDataURL("image/png");
  }
}
