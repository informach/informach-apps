import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import {
  type CaptureProfile,
  captureProfileSchema,
  profileUpdateSchema,
  type SavedRegion,
  savedRegionSchema,
} from "../domain/capture-preferences.ts";

type Shortcuts = {
  register: (key: string, callback: () => void) => boolean;
  unregister: (key: string) => void;
};
/** Only this registry's registrations are ever released. Existing suite shortcuts stay owned by main. */
export class CapturePreferences {
  private profile = captureProfileSchema.parse({});
  private owned = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;
  private errors: string[] = [];
  private path: string;
  private shortcuts: Shortcuts;
  private intent: (id: string) => void;
  constructor(path: string, shortcuts: Shortcuts, intent: (id: string) => void) {
    this.path = path;
    this.shortcuts = shortcuts;
    this.intent = intent;
  }
  read() {
    return structuredClone(this.profile);
  }
  status() {
    return { ...this.read(), shortcutErrors: [...this.errors] };
  }
  async load() {
    try {
      const bytes = await readFile(this.path);
      if (bytes.length > 1024 * 1024) throw new Error("Preferências de captura excedem o limite.");
      this.profile = captureProfileSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    this.loaded = true;
  }
  activate() {
    this.errors = [];
    for (const preset of this.profile.presets) {
      if (!preset.shortcut || this.owned.has(preset.shortcut)) continue;
      try {
        this.register(preset.shortcut);
      } catch {
        this.errors.push(`Atalho indisponível para ${preset.name}: ${preset.shortcut}`);
      }
    }
    return this.status();
  }
  private register(key: string) {
    const ok = this.shortcuts.register(key, () => {
      const preset = this.profile.presets.find((p) => p.shortcut === key);
      if (preset) this.intent(preset.id);
    });
    if (!ok) throw new Error(`Atalho em conflito: ${key}. Escolha outro.`);
    this.owned.add(key);
  }
  private serial<T>(task: () => Promise<T>) {
    const pending = this.queue.then(task);
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  private async write(next: CaptureProfile) {
    if (!this.loaded)
      throw new Error("Preferências indisponíveis; arquivo existente foi preservado.");
    const file = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(file, JSON.stringify(next), { flag: "wx", mode: 0o600 });
      await rename(file, this.path);
    } finally {
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  update(input: unknown) {
    const change = profileUpdateSchema.parse(input);
    return this.serial(async () => {
      const next = captureProfileSchema.parse({ ...this.profile, ...change });
      const added: string[] = [];
      try {
        for (const p of next.presets)
          if (p.shortcut && !this.owned.has(p.shortcut)) {
            this.register(p.shortcut);
            added.push(p.shortcut);
          }
        await this.write(next);
      } catch (error) {
        for (const key of added) {
          this.shortcuts.unregister(key);
          this.owned.delete(key);
        }
        throw error;
      }
      this.profile = next;
      for (const key of this.owned)
        if (!next.presets.some((p) => p.shortcut === key)) {
          this.shortcuts.unregister(key);
          this.owned.delete(key);
        }
      this.errors = [];
      return this.status();
    });
  }
  remember(input: SavedRegion) {
    const last = savedRegionSchema.parse(input);
    return this.serial(async () => {
      const next = { ...this.profile, last };
      await this.write(next);
      this.profile = next;
    });
  }
  dispose() {
    for (const key of this.owned) this.shortcuts.unregister(key);
    this.owned.clear();
  }
}
