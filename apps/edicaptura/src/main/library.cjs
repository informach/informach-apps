const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { atomicWrite } = require("@informach/edi-desktop/files");
const { parseDocument, metadataUpdateSchema } = require("../domain/document.ts");
const { validateVideoRecipe } = require("../domain/quick-video.ts");
const { LibraryIndex, summarize } = require("../domain/library-index.ts");
const {
  OCR_SIDECAR_EXTENSION,
  ocrEditSchema,
  ocrSaveSchema,
  ocrSidecarSchema,
  searchableText,
} = require("../domain/ocr.ts");
const { snapshot, importProject } = require("./portable.ts");
const { assertRasterBudget } = require("../domain/assets.ts");
const { assertVideoDiskSpace, copyVideo, hashVideo, videoIdentity } = require("./video-files.ts");
const { createHash } = require("node:crypto");
const pngSize = (bytes) => {
  if (bytes.length < 24 || bytes.toString("latin1", 1, 4) !== "PNG")
    throw new Error("Original da captura inválido.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
class Library {
  constructor(root, videoUrl) {
    this.root = root;
    this.queue = Promise.resolve();
    this.index = null;
    this.loadingIndex = null;
    this.videoUrl = videoUrl;
  }
  file(id, ext) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Identificador inválido.");
    return path.join(this.root, `${id}.${ext}`);
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
  }
  async loadIndex() {
    if (this.index) return;
    if (this.loadingIndex) return this.loadingIndex;
    this.loadingIndex = (async () => {
      const index = new LibraryIndex();
      const names = await fs.readdir(this.root);
      for (const name of names.filter((n) => n.endsWith(".json"))) {
        try {
          const doc = parseDocument(
            JSON.parse(await fs.readFile(path.join(this.root, name), "utf8")),
          );
          if (`${doc.id}.json` !== name)
            throw new Error("Identidade do projeto não corresponde ao arquivo.");
          index.upsert(summarize(doc));
        } catch (error) {
          const stat = await fs.stat(path.join(this.root, name));
          index.upsert({
            id: name.slice(0, -5),
            name: "Captura danificada — recuperar original",
            kind: "damaged",
            created: stat.mtime.toISOString(),
            updated: stat.mtime.toISOString(),
            problem: error.message,
            tags: [],
            favorite: false,
            collection: "",
            sourceApp: "",
            deletedAt: null,
          });
        }
      }
      this.index = index;
      this.contentLoaded = false;
    })();
    try {
      await this.loadingIndex;
    } finally {
      this.loadingIndex = null;
    }
  }
  async list(query) {
    await this.queue;
    await this.loadIndex();
    if (query?.content) await this.loadContent();
    return query === undefined ? this.index.query({}).items : this.index.query(query);
  }
  /** Recognized text for the optional content search, read once from the sidecars. */
  async loadContent() {
    if (this.contentLoaded) return;
    for (const name of await fs.readdir(this.root)) {
      if (!name.endsWith(`.${OCR_SIDECAR_EXTENSION}`)) continue;
      const id = name.slice(0, -(OCR_SIDECAR_EXTENSION.length + 1));
      try {
        this.file(id, OCR_SIDECAR_EXTENSION);
        const sidecar = ocrSidecarSchema.parse(
          JSON.parse(await fs.readFile(path.join(this.root, name), "utf8")),
        );
        this.index.setContent(id, searchableText(sidecar));
      } catch {
        // A damaged or foreign sidecar is left on disk and simply not searched.
      }
    }
    this.contentLoaded = true;
  }
  async loadContentOf(id) {
    try {
      const sidecar = ocrSidecarSchema.parse(
        JSON.parse(await fs.readFile(this.file(id, OCR_SIDECAR_EXTENSION), "utf8")),
      );
      this.index.setContent(id, searchableText(sidecar));
    } catch {
      this.index.setContent(id, null);
    }
  }
  /** The capture's recognized text, or null when there is none or its original changed. */
  readOcr(id) {
    return this.transaction(async () => {
      let raw;
      try {
        raw = await fs.readFile(this.file(id, OCR_SIDECAR_EXTENSION), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
      const sidecar = ocrSidecarSchema.parse(JSON.parse(raw));
      const original = await fs.readFile(this.file(id, "png"));
      if (createHash("sha256").update(original).digest("hex") !== sidecar.source.sha256)
        return { stale: true };
      return sidecar;
    });
  }
  saveOcr(input) {
    const { id, languages, result } = ocrSaveSchema.parse(input);
    return this.transaction(async () => {
      const doc = parseDocument(JSON.parse(await fs.readFile(this.file(id, "json"), "utf8")));
      if (doc.kind !== "image") throw new Error("Só imagens têm texto reconhecido.");
      const original = await fs.readFile(this.file(id, "png"));
      const size = pngSize(original);
      if (size.width !== result.width || size.height !== result.height)
        throw new Error("O texto reconhecido não corresponde ao original da captura.");
      const sidecar = ocrSidecarSchema.parse({
        version: 1,
        source: { sha256: createHash("sha256").update(original).digest("hex"), ...size },
        languages,
        recognizedAt: new Date().toISOString(),
        status: result.words.some((word) => word.text.trim()) ? "text" : "empty",
        result,
        edits: {},
      });
      await atomicWrite(this.file(id, OCR_SIDECAR_EXTENSION), JSON.stringify(sidecar));
      if (this.contentLoaded) this.index?.setContent(id, searchableText(sidecar));
      return sidecar;
    });
  }
  editOcr(input) {
    const { id, edits } = ocrEditSchema.parse(input);
    return this.transaction(async () => {
      const file = this.file(id, OCR_SIDECAR_EXTENSION);
      const sidecar = ocrSidecarSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
      const lines = new Set(sidecar.result.words.map((word) => String(word.line)));
      if (Object.keys(edits).some((line) => !lines.has(line)))
        throw new Error("Correção para uma linha que não existe.");
      const next = { ...sidecar, edits };
      await atomicWrite(file, JSON.stringify(next));
      if (this.contentLoaded) this.index?.setContent(id, searchableText(next));
      return next;
    });
  }
  /** Removes the recognized text (opt-out); the image and the project stay as they are. */
  deleteOcr(id) {
    return this.transaction(async () => {
      await fs.rm(this.file(id, OCR_SIDECAR_EXTENSION), { force: true });
      this.index?.setContent(id, null);
      return true;
    });
  }
  transaction(fn) {
    const operation = this.queue.then(fn);
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  refreshIndex() {
    return this.transaction(async () => {
      this.index = null;
      this.contentLoaded = false;
      await this.loadIndex();
    });
  }
  duplicate(id) {
    return this.transaction(async () => {
      this.file(id, "json");
      const result = await importProject(this.root, await snapshot(this.root, id), true);
      const record = parseDocument(
        JSON.parse(await fs.readFile(this.file(result.id, "json"), "utf8")),
      );
      this.index?.upsert(summarize(record));
      if (this.contentLoaded) await this.loadContentOf(record.id);
      return record;
    });
  }
  importPortable(files) {
    return this.transaction(async () => {
      const result = await importProject(this.root, files);
      const record = parseDocument(
        JSON.parse(await fs.readFile(this.file(result.id, "json"), "utf8")),
      );
      this.index?.upsert(summarize(record));
      if (this.contentLoaded) await this.loadContentOf(record.id);
      return record;
    });
  }
  async read(id) {
    const data = parseDocument(JSON.parse(await fs.readFile(this.file(id, "json"), "utf8")));
    if (data.id !== id) throw new Error("Identidade do projeto não corresponde ao arquivo.");
    const assetUrls = new Map();
    let sourceCharacters = 0;
    for (const annotation of data.annotations)
      if (annotation.kind === "image") {
        if (!assetUrls.has(annotation.assetId)) {
          const stat = await fs.stat(this.file(id, `${annotation.assetId}.png`));
          sourceCharacters += 22 + 4 * Math.ceil(stat.size / 3);
          assertRasterBudget(JSON.stringify(data).length, sourceCharacters);
          assetUrls.set(
            annotation.assetId,
            `data:image/png;base64,${(await fs.readFile(this.file(id, `${annotation.assetId}.png`))).toString("base64")}`,
          );
        }
        delete annotation.dataUrl;
      }
    if (data.kind === "video") {
      await videoIdentity(this.file(id, "webm"));
      return {
        ...data,
        dataUrl: this.videoUrl ? await this.videoUrl(this.root, id, this.file(id, "webm")) : "",
      };
    }
    return {
      ...data,
      assets: [...assetUrls].map(([id, dataUrl]) => ({ id, dataUrl })),
      dataUrl: `data:image/png;base64,${(await fs.readFile(this.file(id, "png"))).toString("base64")}`,
    };
  }
  save(data, bytes, assets = []) {
    const operation = this.queue.then(async () => {
      await this.loadIndex();
      const id = data.id || randomUUID();
      const oldBytes = data.id ? await fs.readFile(this.file(id, "json"), "utf8") : null;
      const old = oldBytes ? parseDocument(JSON.parse(oldBytes)) : null;
      if (old && data.kind && old.kind !== data.kind)
        throw new Error("Não é permitido trocar o tipo de mídia do projeto.");
      const record = parseDocument({
        version: 1,
        id,
        name: String(data.name || old?.name || "Captura").slice(0, 120),
        kind: old?.kind || (data.kind === "video" ? "video" : "image"),
        created: old?.created || new Date().toISOString(),
        updated: new Date().toISOString(),
        annotations: data.annotations ?? old?.annotations ?? [],
        crop: data.crop === undefined ? (old?.crop ?? null) : data.crop,
        viewTransform: data.viewTransform ?? old?.viewTransform,
        preview: data.preview || old?.preview,
        tags: data.tags ?? old?.tags,
        favorite: data.favorite ?? old?.favorite,
        collection: data.collection ?? old?.collection,
        sourceApp: data.sourceApp ?? old?.sourceApp,
        deletedAt: data.deletedAt === undefined ? old?.deletedAt : data.deletedAt,
        videoRecipe: data.videoRecipe === undefined ? old?.videoRecipe : data.videoRecipe,
        media:
          data.media ?? old?.media ?? (data.kind === "video" ? { status: "pending" } : undefined),
      });
      if (
        record.videoRecipe &&
        data.videoRecipe !== undefined &&
        JSON.stringify(record.videoRecipe) !== JSON.stringify(old?.videoRecipe)
      ) {
        if (record.kind !== "video" || record.media?.status !== "ready")
          throw new Error("Aguarde a leitura dos metadados do vídeo.");
        validateVideoRecipe(record.videoRecipe, record.media.durationSeconds);
      }
      if (oldBytes && !JSON.parse(oldBytes).version)
        await atomicWrite(this.file(id, "legacy-backup"), oldBytes);
      if (bytes && old) {
        const original = await fs.readFile(this.file(id, record.kind === "video" ? "webm" : "png"));
        if (!original.equals(Buffer.from(bytes)))
          throw new Error("O original é imutável. Importe uma nova captura.");
      }
      if (bytes && !old) {
        const target = this.file(id, record.kind === "video" ? "webm" : "png");
        await atomicWrite(target, bytes);
      }
      const meta = this.file(id, "json");
      for (const asset of assets) {
        metadataUpdateSchema.shape.id.parse(asset.id);
        const target = this.file(id, `${asset.id}.png`);
        const exists = await fs.readFile(target).then(
          (existing) => {
            if (!existing.equals(asset.bytes)) throw new Error("Imagem de composição conflitante.");
            return true;
          },
          (error) => {
            if (error.code === "ENOENT") return false;
            throw error;
          },
        );
        if (!exists) await atomicWrite(target, asset.bytes);
      }
      const referenced = new Set();
      let sourceCharacters = 0;
      for (const annotation of record.annotations)
        if (annotation.kind === "image") {
          delete annotation.dataUrl;
          if (referenced.has(annotation.assetId)) continue;
          referenced.add(annotation.assetId);
          const stat = await fs.stat(this.file(id, `${annotation.assetId}.png`));
          if (!stat.isFile()) throw new Error("Imagem de composição não encontrada.");
          sourceCharacters += 22 + 4 * Math.ceil(stat.size / 3);
        }
      assertRasterBudget(JSON.stringify(record).length, sourceCharacters);
      await atomicWrite(meta, JSON.stringify(record));
      this.index?.upsert(summarize(record));
      return record;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  importVideoFile(file, journal) {
    return this.transaction(async () => {
      const id = journal.id;
      const media = this.file(id, "webm");
      const metadata = this.file(id, "json");
      try {
        const existing = parseDocument(JSON.parse(await fs.readFile(metadata, "utf8")));
        const digest = await hashVideo(media);
        if (
          existing.kind !== "video" ||
          digest.sha256 !== journal.sha256 ||
          digest.bytes !== journal.bytes
        )
          throw new Error("Vídeo da biblioteca difere da recuperação; originais preservados.");
        return existing;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const record = parseDocument({
        id,
        name: `Gravação ${new Date(journal.created).toLocaleString("pt-BR")}`,
        kind: "video",
        created: journal.created,
        updated: new Date().toISOString(),
        media: { status: "pending", durationSeconds: journal.durationMs / 1000 },
      });
      const serialized = JSON.stringify(record);
      let retained;
      try {
        retained = await hashVideo(media);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (retained) {
        if (retained.sha256 !== journal.sha256 || retained.bytes !== journal.bytes)
          throw new Error("Vídeo existente difere da recuperação; originais preservados.");
      } else {
        const digest = await hashVideo(file);
        if (digest.sha256 !== journal.sha256 || digest.bytes !== journal.bytes)
          throw new Error("Vídeo montado difere do journal.");
        await assertVideoDiskSpace(this.root, journal.bytes + Buffer.byteLength(serialized));
        await copyVideo(file, media);
      }
      await assertVideoDiskSpace(this.root, Buffer.byteLength(serialized));
      await atomicWrite(metadata, serialized);
      this.index?.upsert(summarize(record));
      return record;
    });
  }
  async updateMetadata(value) {
    const data = metadataUpdateSchema.parse(value);
    return this.save(data);
  }
  recover(id) {
    const operation = this.queue.then(async () => {
      this.file(id, "json");
      const originalPath = this.file(id, "png");
      const videoPath = this.file(id, "webm");
      const imageExists = await fs.stat(originalPath).then(
        (stat) => stat.isFile(),
        (error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      );
      const videoExists = await fs.stat(videoPath).then(
        (stat) => stat.isFile(),
        (error) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      );
      if (!imageExists && !videoExists)
        throw new Error("Arquivo original não encontrado. Metadados foram preservados.");
      if (imageExists && videoExists)
        throw new Error(
          "Existem duas mídias com este ID. Preserve os arquivos e escolha uma cópia para importar.",
        );
      const meta = this.file(id, "json");
      const damaged = await fs.readFile(meta);
      await atomicWrite(this.file(id, `damaged-${Date.now()}`), damaged);
      const time = new Date().toISOString();
      const record = parseDocument({
        id,
        kind: imageExists ? "image" : "video",
        name: "Original recuperado",
        created: time,
        updated: time,
        annotations: [],
        crop: null,
      });
      await atomicWrite(meta, JSON.stringify(record));
      this.index?.upsert(summarize(record));
      return record;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
module.exports = { Library };
