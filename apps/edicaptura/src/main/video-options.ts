import { readFile } from "node:fs/promises";
import { atomicWrite } from "@informach/edi-desktop/files";
import {
  defaultVideoOptions,
  type VideoOptions,
  videoOptionsSchema,
} from "../domain/video-options.ts";

/**
 * The quick-video options in userData, written atomically. An unreadable file is reported and
 * kept: the defaults are used for this run and the file is not replaced until the person saves.
 */
export class VideoOptionsStore {
  private options = defaultVideoOptions();
  private queue: Promise<unknown> = Promise.resolve();
  error: string | null = null;
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  async load() {
    try {
      const bytes = await readFile(this.path);
      if (bytes.length > 64 * 1024) throw new Error("Opções de vídeo excedem o limite.");
      this.options = videoOptionsSchema.parse(JSON.parse(bytes.toString("utf8")));
      this.error = null;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      this.options = defaultVideoOptions();
      this.error = "Opções de vídeo ilegíveis; usando o padrão sem substituir o arquivo.";
    }
  }
  read(): VideoOptions {
    return structuredClone(this.options);
  }
  save(input: unknown): Promise<VideoOptions> {
    const next = videoOptionsSchema.parse(input);
    const task = this.queue.then(async () => {
      await atomicWrite(this.path, JSON.stringify(next));
      this.options = next;
      this.error = null;
      return this.read();
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
