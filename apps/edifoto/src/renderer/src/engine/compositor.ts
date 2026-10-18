import { type BlendMode, blendIndex } from "@shared/blendModes";
import type { Adjust, Doc, Gradient, Layer, Transform } from "@shared/doc";
import { validateDimensions } from "@shared/documentFormat";
import { inverse, localPlacement, maskPlacement } from "@shared/placement";
import { getBitmap } from "./bitmaps";
import { CLEAR_FS, DISPLAY_FS, FULLSCREEN_VS, LAYER_FS } from "./shaders";
import { renderText } from "./text";
import { renderVector } from "./vector";

/**
 * WebGL2 compositor. Layers are blended bottom-up into ping-pong render targets at document
 * resolution (half-float when the GPU allows, for smooth gradients and adjustments), then the
 * result is drawn on screen with pan/zoom. The same pipeline renders exports and AI previews at
 * any scale, so what you see is what you export.
 */

export interface RenderOptions {
  /** Target size = document size × scale. */
  scale?: number;
  /** Render this layer alone. */
  only?: string;
  /** Temporarily show one layer with another blend mode (hover previews, contact sheets). */
  modeOverride?: { layerId: string; mode: BlendMode };
  /** Opening-state composite, kept independently of editable layers. */
  before?: boolean;
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

interface Target {
  w: number;
  h: number;
  tex: [WebGLTexture, WebGLTexture];
  fb: [WebGLFramebuffer, WebGLFramebuffer];
  /** Index of the target holding the latest result. */
  cur: number;
}

interface TexEntry {
  tex: WebGLTexture;
  version: number;
  w: number;
  h: number;
  used: number;
}

const hexToRgba = (hex: string, a = 1): [number, number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private floatTargets: boolean;
  private layerProg: WebGLProgram;
  private clearProg: WebGLProgram;
  private displayProg: WebGLProgram;
  private copyProg: WebGLProgram;
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private textures = new Map<string, TexEntry>();
  private targets = new Map<string, Target>();
  private white: WebGLTexture;
  private frame = 0;
  /** Bumps on every composite, so the screen knows when its last result was overwritten. */
  compositeCount = 0;
  /** Called after an offscreen render (export, preview) overwrote the on-screen result. */
  onOffscreenRender: (() => void) | null = null;
  maxTexture: number;
  private originalImage: HTMLCanvasElement | null = null;
  rememberOriginal(doc: Doc): void {
    this.originalImage = this.renderToCanvas(doc, {
      scale: Math.min(1, 1600 / Math.max(doc.width, doc.height)),
    });
  }
  clearOriginal(): void {
    this.originalImage = null;
  }
  private contextLost = false;

  constructor(canvas?: HTMLCanvasElement, observe = true) {
    this.canvas = canvas ?? document.createElement("canvas");
    this.canvas.className = "gl-canvas";
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("Este computador não oferece WebGL2, necessário para o EdiFoto.");
    this.gl = gl;
    this.floatTargets = !!gl.getExtension("EXT_color_buffer_float");
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.layerProg = this.program(LAYER_FS);
    this.clearProg = this.program(CLEAR_FS);
    this.displayProg = this.program(DISPLAY_FS);
    this.copyProg = this.program(`#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uImage;
void main() { outColor = texelFetch(uImage, ivec2(gl_FragCoord.xy), 0); }`);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.white = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    if (observe) {
      this.canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.contextLost = true;
        window.dispatchEvent(new Event("edifoto:graphics-lost"));
      });
      this.canvas.addEventListener("webglcontextrestored", () => {
        const rebuilt = new Compositor(this.canvas, false);
        this.gl = rebuilt.gl;
        this.floatTargets = rebuilt.floatTargets;
        this.layerProg = rebuilt.layerProg;
        this.clearProg = rebuilt.clearProg;
        this.displayProg = rebuilt.displayProg;
        this.copyProg = rebuilt.copyProg;
        this.uniforms = rebuilt.uniforms;
        this.textures = rebuilt.textures;
        this.targets = rebuilt.targets;
        this.white = rebuilt.white;
        this.maxTexture = rebuilt.maxTexture;
        this.contextLost = false;
        this.frame = 0;
        this.compositeCount++;
        this.onOffscreenRender?.();
      });
    }
  }

  private program(fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, FULLSCREEN_VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(`Programa: ${gl.getProgramInfoLog(p)}`);
    this.uniforms.set(p, new Map());
    return p;
  }

  private u(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    const cache = this.uniforms.get(p)!;
    if (!cache.has(name)) cache.set(name, this.gl.getUniformLocation(p, name));
    return cache.get(name)!;
  }

  private target(w: number, h: number): Target {
    validateDimensions(w, h, this.maxTexture);
    const key = `${w}x${h}`;
    const hit = this.targets.get(key);
    if (hit) return hit;
    const gl = this.gl;
    const make = (): [WebGLTexture, WebGLFramebuffer] => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.floatTargets)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(fb);
        gl.deleteTexture(tex);
        throw new Error(
          "Não há memória gráfica suficiente para esta imagem. Salve o projeto e use dimensões menores.",
        );
      }
      return [tex, fb];
    };
    const a = make();
    const b = make();
    const t: Target = { w, h, tex: [a[0], b[0]], fb: [a[1], b[1]], cur: 0 };
    this.targets.set(key, t);
    return t;
  }

  /** Drops render targets other than the document-sized ones in use. */
  releaseTargets(keep?: Target): void {
    const gl = this.gl;
    for (const [k, t] of this.targets) {
      if (t === keep) continue;
      t.tex.forEach((x) => {
        gl.deleteTexture(x);
      });
      t.fb.forEach((x) => {
        gl.deleteFramebuffer(x);
      });
      this.targets.delete(k);
    }
  }

  /** Uploads (or partially re-uploads) a canvas as a mipmapped texture. */
  private texture(
    key: string,
    canvas: HTMLCanvasElement,
    version: number,
    dirty?: { x: number; y: number; w: number; h: number } | "all" | null,
  ): WebGLTexture {
    const gl = this.gl;
    let e = this.textures.get(key);
    const sizeChanged = !e || e.w !== canvas.width || e.h !== canvas.height;
    if (e) {
      this.textures.delete(key);
      this.textures.set(key, e);
    }
    if (e && !sizeChanged && e.version === version) {
      e.used = this.frame;
      return e.tex;
    }
    if (!e || sizeChanged) {
      if (e) {
        gl.deleteTexture(e.tex);
        this.textures.delete(key);
      }
      // Keep the most recently requested source and mask; older textures can be re-uploaded.
      let pixels = canvas.width * canvas.height;
      for (const entry of this.textures.values()) pixels += entry.w * entry.h;
      for (const [id, entry] of this.textures) {
        if (pixels <= 64_000_000) break;
        pixels -= entry.w * entry.h;
        gl.deleteTexture(entry.tex);
        this.textures.delete(id);
      }
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      e = { tex, version, w: canvas.width, h: canvas.height, used: this.frame };
      this.textures.set(key, e);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      if (dirty && dirty !== "all") {
        const x = Math.max(0, Math.floor(dirty.x));
        const y = Math.max(0, Math.floor(dirty.y));
        const w = Math.min(canvas.width - x, Math.ceil(dirty.w) + 1);
        const h = Math.min(canvas.height - y, Math.ceil(dirty.h) + 1);
        if (w > 0 && h > 0) {
          const data = canvas.getContext("2d")!.getImageData(x, y, w, h);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data.data);
        }
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      }
      e.version = version;
      e.used = this.frame;
    }
    gl.generateMipmap(gl.TEXTURE_2D);
    if (gl.getError() !== gl.NO_ERROR) {
      gl.deleteTexture(e.tex);
      this.textures.delete(key);
      throw new Error(
        "Não foi possível preparar a imagem na GPU. Salve o projeto e tente dimensões menores.",
      );
    }
    return e.tex;
  }

  private bitmapTexture(id: string): WebGLTexture | null {
    const b = getBitmap(id);
    if (!b) return null;
    const tex = this.texture(id, b.canvas, b.version, b.dirty);
    b.dirty = null;
    return tex;
  }

  private draw(prog: WebGLProgram, fb: WebGLFramebuffer | null, w: number, h: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTex(prog: WebGLProgram, name: string, unit: number, tex: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(prog, name), unit);
  }

  /** Composites the document and returns the target holding the result. */
  composite(doc: Doc, opts: RenderOptions = {}): Target {
    if (this.contextLost)
      throw new Error(
        "A placa gráfica interrompeu a visualização. Seu trabalho continua disponível para salvar.",
      );
    const gl = this.gl;
    this.frame++;
    this.compositeCount++;
    const scale = opts.scale ?? 1;
    const w = Math.max(1, Math.round(doc.width * scale));
    const h = Math.max(1, Math.round(doc.height * scale));
    const t = this.target(w, h);
    gl.disable(gl.BLEND);
    this.draw(this.clearProg, t.fb[0], w, h);
    t.cur = 0;
    if (opts.before && this.originalImage) {
      const source = this.originalImage;
      const image = document.createElement("canvas");
      image.width = w;
      image.height = h;
      const ctx = image.getContext("2d");
      if (!ctx) throw new Error("Não foi possível comparar a imagem.");
      const fit = Math.min(w / source.width, h / source.height);
      ctx.drawImage(
        source,
        (w - source.width * fit) / 2,
        (h - source.height * fit) / 2,
        source.width * fit,
        source.height * fit,
      );
      const tex = this.texture("original-preview", image, this.frame);
      gl.useProgram(this.copyProg);
      this.bindTex(this.copyProg, "uImage", 0, tex);
      this.draw(this.copyProg, t.fb[0], w, h);
      return t;
    }

    let layers = doc.layers.filter((l) => l.visible);
    if (opts.only) layers = doc.layers.filter((l) => l.id === opts.only);
    else if (opts.before) layers = layers.slice(0, 1);

    const p = this.layerProg;
    for (const layer of layers) {
      if (layer.opacity * layer.fill <= 0 && !opts.only) continue;
      // Upload the mask before binding the source: uploads bind a texture on the active unit.
      const maskTex =
        layer.mask?.enabled && !opts.only ? this.bitmapTexture(layer.mask.bitmap) : null;
      if (!this.setupLayer(layer, doc)) continue;
      const mode =
        opts.modeOverride?.layerId === layer.id ? opts.modeOverride.mode : layer.blendMode;
      gl.useProgram(p);
      gl.uniform2f(this.u(p, "uTarget"), w, h);
      gl.uniform2f(this.u(p, "uDoc"), doc.width, doc.height);
      gl.uniform1i(this.u(p, "uMode"), opts.only ? 0 : blendIndex(mode));
      gl.uniform1f(this.u(p, "uAlpha"), opts.only ? 1 : layer.opacity * layer.fill);
      gl.uniform1i(this.u(p, "uHasMask"), maskTex ? 1 : 0);
      const [ma, mb, mc, md, mx, my] = maskPlacement(layer);
      gl.uniformMatrix3fv(
        this.u(p, "uToMask"),
        false,
        new Float32Array([
          ma / doc.width,
          mb / doc.height,
          0,
          mc / doc.width,
          md / doc.height,
          0,
          mx / doc.width,
          my / doc.height,
          1,
        ]),
      );
      this.bindTex(p, "uMask", 2, maskTex ?? this.white);
      this.bindTex(p, "uBackdrop", 0, t.tex[t.cur]);
      this.draw(p, t.fb[1 - t.cur], w, h);
      t.cur = 1 - t.cur;
    }
    if (scale === 1 && !opts.only) this.collectTextures(doc);
    return t;
  }

  /** Sets source uniforms for one layer; false when there is nothing to draw. */
  private setupLayer(layer: Layer, doc: Doc): boolean {
    const gl = this.gl;
    const p = this.layerProg;
    gl.useProgram(p);
    const kind = (k: number): void => {
      gl.uniform1i(this.u(p, "uKind"), k);
    };
    switch (layer.kind) {
      case "raster": {
        const tex = this.bitmapTexture(layer.bitmap);
        if (!tex) return false;
        kind(0);
        this.bindTex(p, "uSrc", 1, tex);
        gl.uniformMatrix3fv(
          this.u(p, "uToLayer"),
          false,
          toLayerMatrix(layer.transform, layer.width, layer.height),
        );
        return true;
      }
      case "vector": {
        const img = renderVector(layer, doc);
        const tex = this.texture(`vector:${layer.id}`, img.canvas, img.version);
        kind(0);
        this.bindTex(p, "uSrc", 1, tex);
        gl.uniformMatrix3fv(
          this.u(p, "uToLayer"),
          false,
          toLayerMatrix(
            {
              x: doc.width / 2,
              y: doc.height / 2,
              scale: 1,
              rotation: 0,
              flipX: false,
              flipY: false,
            },
            doc.width,
            doc.height,
          ),
        );
        return true;
      }
      case "text": {
        const img = renderText(layer.text);
        const tex = this.texture(`text:${layer.id}`, img.canvas, img.version);
        kind(0);
        this.bindTex(p, "uSrc", 1, tex);
        gl.uniformMatrix3fv(
          this.u(p, "uToLayer"),
          false,
          toLayerMatrix(layer.transform, img.canvas.width, img.canvas.height),
        );
        return true;
      }
      case "solid":
        kind(1);
        gl.uniform4fv(this.u(p, "uColor"), hexToRgba(layer.color));
        this.bindTex(p, "uSrc", 1, this.white);
        return true;
      case "gradient":
        this.setupGradient(layer.gradient, doc);
        this.bindTex(p, "uSrc", 1, this.white);
        return true;
      case "adjust":
        kind(4);
        this.setupAdjust(layer.adjust);
        this.bindTex(p, "uSrc", 1, this.white);
        return true;
    }
  }

  private setupGradient(g: Gradient, doc: Doc): void {
    const gl = this.gl;
    const p = this.layerProg;
    const stops = [...g.stops].sort((a, b) => a.position - b.position).slice(0, 8);
    const colors = new Float32Array(32);
    const pos = new Float32Array(8);
    stops.forEach((s, i) => {
      colors.set(hexToRgba(s.color, s.opacity), i * 4);
      pos[i] = s.position;
    });
    gl.uniform1i(this.u(p, "uStops"), stops.length);
    gl.uniform4fv(this.u(p, "uStopColor"), colors);
    gl.uniform1fv(this.u(p, "uStopPos"), pos);
    const width = g.space?.width ?? doc.width,
      height = g.space?.height ?? doc.height;
    const [a, b, c, d, x, y] = g.space?.toLocal ?? [1, 0, 0, 1, 0, 0];
    gl.uniformMatrix3fv(
      this.u(p, "uToGradient"),
      false,
      new Float32Array([a, b, 0, c, d, 0, x, y, 1]),
    );
    const cx = g.cx * width;
    const cy = g.cy * height;
    if (g.type === "radial") {
      gl.uniform1i(this.u(p, "uKind"), 3);
      gl.uniform2f(this.u(p, "uG0"), cx, cy);
      gl.uniform2f(this.u(p, "uG1"), (g.scale * Math.hypot(width, height)) / 2, 0);
    } else {
      const a = (g.angle * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const len = ((Math.abs(width * dx) + Math.abs(height * dy)) * g.scale) / 2;
      gl.uniform1i(this.u(p, "uKind"), 2);
      gl.uniform2f(this.u(p, "uG0"), cx - dx * len, cy - dy * len);
      gl.uniform2f(this.u(p, "uG1"), cx + dx * len, cy + dy * len);
    }
  }

  private setupAdjust(a: Adjust): void {
    const gl = this.gl;
    const p = this.layerProg;
    const f = (name: string, v: number): void => {
      gl.uniform1f(this.u(p, name), v);
    };
    gl.uniform3f(
      this.u(p, "uLvlBlack"),
      a.levels.black[0] / 255,
      a.levels.black[1] / 255,
      a.levels.black[2] / 255,
    );
    gl.uniform3f(
      this.u(p, "uLvlWhite"),
      a.levels.white[0] / 255,
      a.levels.white[1] / 255,
      a.levels.white[2] / 255,
    );
    gl.uniform1fv(this.u(p, "uCurve"), new Float32Array(a.curves ?? [0, 0.25, 0.5, 0.75, 1]));
    f("uLvlGamma", a.levels.gamma || 1);
    f("uExposure", a.exposure);
    f("uBrightness", a.brightness / 100);
    f("uContrast", a.contrast / 100);
    f("uHighlights", a.highlights / 100);
    f("uShadows", a.shadows / 100);
    f("uTemp", a.temperature / 100);
    f("uTint", a.tint / 100);
    f("uVibrance", a.vibrance / 100);
    f("uSaturation", a.saturation / 100);
    f("uHue", a.hue);
    gl.uniform1i(this.u(p, "uGray"), a.grayscale ? 1 : 0);
    gl.uniform1i(this.u(p, "uInvert"), a.invert ? 1 : 0);
  }

  /** Frees GPU copies of bitmaps the document no longer shows (undo re-uploads them). */
  private collectTextures(doc: Doc): void {
    const live = new Set<string>();
    for (const l of doc.layers) {
      if (l.kind === "raster") live.add(l.bitmap);
      if (l.kind === "vector") live.add(`vector:${l.id}`);
      if (l.kind === "text") live.add(`text:${l.id}`);
      if (l.mask) live.add(l.mask.bitmap);
    }
    for (const [k, e] of this.textures) {
      if (!live.has(k) && this.frame - e.used > 2) {
        this.gl.deleteTexture(e.tex);
        this.textures.delete(k);
      }
    }
  }

  /** Draws a composite on the visible canvas. */
  display(t: Target, doc: Doc, view: View): void {
    const gl = this.gl;
    const p = this.displayProg;
    const tex = t.tex[t.cur];
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, view.zoom >= 2 ? gl.NEAREST : gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.useProgram(p);
    this.bindTex(p, "uImage", 0, tex);
    const dpr = window.devicePixelRatio || 1;
    gl.uniform2f(this.u(p, "uCanvas"), this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u(p, "uPan"), view.panX * dpr, view.panY * dpr);
    gl.uniform1f(this.u(p, "uZoom"), view.zoom * dpr);
    gl.uniform2f(this.u(p, "uDoc"), doc.width, doc.height);
    gl.uniform3f(this.u(p, "uBg"), 0x11 / 255, 0x11 / 255, 0x13 / 255);
    gl.uniform1f(this.u(p, "uDpr"), dpr);
    this.draw(p, null, this.canvas.width, this.canvas.height);
    // Leave the result texture without mipmap sampling so it can be rendered into again.
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  /** Reads a composite back as 8-bit RGBA (straight alpha, top row first). */
  read(t: Target): ImageData {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, t.w, t.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const p = this.copyProg;
    gl.useProgram(p);
    this.bindTex(p, "uImage", 0, t.tex[t.cur]);
    this.draw(p, fb, t.w, t.h);
    const data = new Uint8Array(t.w * t.h * 4);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return new ImageData(new Uint8ClampedArray(data.buffer), t.w, t.h);
  }

  /** Color of one document pixel in a composite (eyedropper). */
  sample(t: Target, x: number, y: number): [number, number, number, number] {
    const gl = this.gl;
    const px = Math.max(0, Math.min(t.w - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(t.h - 1, Math.floor(y)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb[t.cur]);
    if (this.floatTargets) {
      const out = new Float32Array(4);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, out);
      return [out[0], out[1], out[2], out[3]];
    }
    const out = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0] / 255, out[1] / 255, out[2] / 255, out[3] / 255];
  }

  /** Composite as a 2D canvas (exports, previews, thumbnails). */
  renderToCanvas(doc: Doc, opts: RenderOptions = {}): HTMLCanvasElement {
    const t = this.composite(doc, opts);
    const img = this.read(t);
    if ((opts.scale ?? 1) !== 1)
      this.releaseTargets(this.targets.get(`${doc.width}x${doc.height}`));
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.putImageData(img, 0, 0);
    this.onOffscreenRender?.();
    return c;
  }
}

/** Maps document pixels to the layer's texture coordinates (inverse of its placement). */
export function toLayerMatrix(t: Transform, w: number, h: number): Float32Array {
  const [a, b, c, d, x, y] = inverse(localPlacement(t, w, h));
  return new Float32Array([a / w, b / h, 0, c / w, d / h, 0, x / w, y / h, 1]);
}

let instance: Compositor | null = null;
export const compositor = (): Compositor => (instance ??= new Compositor());
