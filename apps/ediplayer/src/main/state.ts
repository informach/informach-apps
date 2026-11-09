import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { atomicWrite } from "@informach/edi-desktop/files";
import { z } from "zod";
import type { PlayerPrefs, RecentItem } from "../shared/types.ts";

/** What EdiPlayer remembers between sessions: recent files, where each stopped, preferences. */

const recentSchema = z.strictObject({
  path: z.string().min(1).max(32768),
  name: z.string().min(1).max(500),
  duration: z.number().min(0).max(200000),
  position: z.number().min(0).max(200000),
  watched: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
});

export const prefsSchema = z.strictObject({
  volume: z.number().min(0).max(2),
  boost: z.boolean(),
  muted: z.boolean(),
  subtitleSize: z.number().min(0.5).max(3),
  subtitleBottom: z.number().min(0).max(40),
});

const stateSchema = z.strictObject({
  version: z.literal(1),
  recents: z.array(recentSchema).max(200),
  prefs: prefsSchema,
});
type State = z.infer<typeof stateSchema>;

export const DEFAULT_PREFS: PlayerPrefs = {
  volume: 1,
  boost: false,
  muted: false,
  subtitleSize: 1,
  subtitleBottom: 8,
};
const MAX_RECENTS = 30;

export const rememberSchema = recentSchema.omit({ updatedAt: true });

export class PlayerState {
  private state: State = { version: 1, recents: [], prefs: DEFAULT_PREFS };
  private loaded: Promise<void> | null = null;
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
  }

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      if (!existsSync(this.file)) return;
      const parsed = stateSchema.safeParse(JSON.parse(await readFile(this.file, "utf8")));
      // A state from another version or damaged by hand starts over instead of failing the app.
      if (parsed.success) this.state = parsed.data;
    })();
    return this.loaded;
  }

  private save(): Promise<void> {
    return atomicWrite(this.file, JSON.stringify(this.state));
  }

  async recents(): Promise<RecentItem[]> {
    await this.load();
    return this.state.recents.filter((r) => existsSync(r.path));
  }

  async remember(item: z.infer<typeof rememberSchema>): Promise<void> {
    await this.load();
    const key = item.path.toLowerCase();
    this.state.recents = [
      { ...item, updatedAt: Date.now() },
      ...this.state.recents.filter((r) => r.path.toLowerCase() !== key),
    ].slice(0, MAX_RECENTS);
    await this.save();
  }

  async positionOf(path: string): Promise<number> {
    await this.load();
    const r = this.state.recents.find((x) => x.path.toLowerCase() === path.toLowerCase());
    return r && !r.watched ? r.position : 0;
  }

  async forget(): Promise<void> {
    await this.load();
    this.state.recents = [];
    await this.save();
  }

  async prefs(): Promise<PlayerPrefs> {
    await this.load();
    return this.state.prefs;
  }

  async savePrefs(prefs: PlayerPrefs): Promise<void> {
    await this.load();
    this.state.prefs = prefsSchema.parse(prefs);
    await this.save();
  }
}
