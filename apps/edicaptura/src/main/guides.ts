import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import {
  GUIDE_EXTENSION,
  type Guide,
  type GuideSummary,
  guideSaveSchema,
  guideSchema,
  MAX_GUIDE_IMAGE_BYTES,
  MAX_STEP_IMAGE_BYTES,
  renderGuideHtml,
} from "../domain/guide.ts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function pngSize(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    buffer.toString("latin1", 12, 16) !== "IHDR"
  )
    throw new Error("Imagem de passo inválida.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Guides in the library folder, flat beside the captures. Step images are immutable assets
 * written once; the guide file is replaced atomically. One operation at a time, and a root
 * switch builds a new store, so a late save never reaches another library.
 */
export class GuideStore {
  private queue: Promise<unknown> = Promise.resolve();
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  private file(id: string, ext: string) {
    if (!UUID.test(id)) throw new Error("Identificador inválido.");
    return path.join(this.root, `${id}.${ext}`);
  }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private async load(id: string): Promise<Guide> {
    const guide = guideSchema.parse(
      JSON.parse(await fs.readFile(this.file(id, GUIDE_EXTENSION), "utf8")),
    );
    if (guide.id !== id) throw new Error("Identidade do guia não corresponde ao arquivo.");
    return guide;
  }
  list(): Promise<GuideSummary[]> {
    return this.serial(async () => {
      const result: GuideSummary[] = [];
      for (const name of await fs.readdir(this.root)) {
        if (!name.endsWith(`.${GUIDE_EXTENSION}`)) continue;
        const id = name.slice(0, -(GUIDE_EXTENSION.length + 1));
        try {
          const guide = await this.load(id);
          result.push({
            id,
            title: guide.title,
            steps: guide.steps.length,
            updated: guide.updated,
            deletedAt: guide.deletedAt,
          });
        } catch {
          result.push({
            id,
            title: "Guia danificado — arquivo preservado",
            steps: 0,
            updated: new Date(0).toISOString(),
            deletedAt: null,
          });
        }
      }
      return result.sort((a, b) => b.updated.localeCompare(a.updated));
    });
  }
  read(id: string) {
    return this.serial(async () => {
      const guide = await this.load(id);
      const images: Record<string, string> = {};
      for (const step of guide.steps)
        images[step.assetId] ??= (await fs.readFile(this.file(id, `${step.assetId}.png`))).toString(
          "base64",
        );
      return { guide, images };
    });
  }
  /** Saves the guide; `assets` carries only images not yet written (PNG, at most 25 MB each). */
  save(input: unknown, assets: { id: string; bytes: Uint8Array }[] = []) {
    const change = guideSaveSchema.parse(input);
    return this.serial(async () => {
      const id = change.id ?? randomUUID();
      let previous: Guide | null = null;
      if (change.id) previous = await this.load(id);
      const now = new Date().toISOString();
      const guide = guideSchema.parse({
        version: 1,
        id,
        title: change.title,
        description: change.description,
        layout: change.layout,
        created: previous?.created ?? now,
        updated: now,
        deletedAt: previous?.deletedAt ?? null,
        steps: change.steps,
      });
      const incoming = new Map(assets.map((asset) => [asset.id, asset.bytes]));
      let total = 0;
      for (const step of guide.steps) {
        const target = this.file(id, `${step.assetId}.png`);
        const bytes = incoming.get(step.assetId);
        let size: number;
        if (bytes) {
          if (bytes.byteLength > MAX_STEP_IMAGE_BYTES)
            throw new Error("Imagem de passo maior que 25 MB.");
          const dimensions = pngSize(bytes);
          if (dimensions.width !== step.width || dimensions.height !== step.height)
            throw new Error("Imagem de passo não corresponde ao passo.");
          const existing = await fs.readFile(target).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          if (existing && !existing.equals(Buffer.from(bytes)))
            throw new Error("Imagem de passo conflitante.");
          if (!existing) await atomicWrite(target, bytes);
          size = bytes.byteLength;
        } else {
          const stat = await fs.stat(target).catch(() => null);
          if (!stat?.isFile()) throw new Error("Imagem de passo ausente.");
          size = stat.size;
        }
        total += size;
        if (total > MAX_GUIDE_IMAGE_BYTES) throw new Error("O guia excede 300 MB de imagens.");
      }
      await atomicWrite(this.file(id, GUIDE_EXTENSION), JSON.stringify(guide));
      return guide;
    });
  }
  /** Local trash: the files stay; restoring brings the guide back as it was. */
  trash(id: string, deleted: boolean) {
    return this.serial(async () => {
      const guide = await this.load(id);
      const next = guideSchema.parse({
        ...guide,
        deletedAt: deleted ? new Date().toISOString() : null,
      });
      await atomicWrite(this.file(id, GUIDE_EXTENSION), JSON.stringify(next));
      return next;
    });
  }
  async html(id: string) {
    const { guide, images } = await this.read(id);
    return { guide, html: renderGuideHtml(guide, new Map(Object.entries(images))) };
  }
}
