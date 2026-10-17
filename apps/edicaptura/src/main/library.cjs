const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class Library {
  constructor(root) {
    this.root = root;
    this.queue = Promise.resolve();
  }
  file(id, ext) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Identificador inválido.");
    return path.join(this.root, `${id}.${ext}`);
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
  }
  async list() {
    const names = await fs.readdir(this.root);
    const items = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .map(async (n) => {
          try {
            const data = JSON.parse(await fs.readFile(path.join(this.root, n), "utf8"));
            if (!data.id || typeof data.updated !== "string" || typeof data.name !== "string")
              return null;
            return {
              id: data.id,
              name: data.name,
              created: data.created,
              updated: data.updated,
              kind: data.kind,
              preview: data.preview,
            };
          } catch {
            return null;
          }
        }),
    );
    return items.filter(Boolean).sort((a, b) => b.updated.localeCompare(a.updated));
  }
  async read(id) {
    const data = JSON.parse(await fs.readFile(this.file(id, "json"), "utf8"));
    if (data.kind === "video")
      return {
        ...data,
        dataUrl: `data:video/webm;base64,${(await fs.readFile(this.file(id, "webm"))).toString("base64")}`,
      };
    return {
      ...data,
      dataUrl: `data:image/png;base64,${(await fs.readFile(this.file(id, "png"))).toString("base64")}`,
    };
  }
  save(data, bytes) {
    const operation = this.queue.then(async () => {
      const id = data.id || randomUUID();
      const old = data.id ? JSON.parse(await fs.readFile(this.file(id, "json"), "utf8")) : null;
      const record = {
        id,
        name: String(data.name || "Captura").slice(0, 120),
        kind: data.kind === "video" ? "video" : "image",
        created: old?.created || new Date().toISOString(),
        updated: new Date().toISOString(),
        annotations: data.annotations || [],
        crop: data.crop || null,
        preview: data.preview || old?.preview,
      };
      if (bytes) {
        const target = this.file(id, record.kind === "video" ? "webm" : "png");
        await fs.writeFile(target + ".tmp", bytes);
        await fs.rename(target + ".tmp", target);
      }
      const meta = this.file(id, "json");
      await fs.writeFile(meta + ".tmp", JSON.stringify(record));
      await fs.rename(meta + ".tmp", meta);
      return record;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
module.exports = { Library };
