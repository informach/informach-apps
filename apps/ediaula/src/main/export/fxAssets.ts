import { createHash } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { type FxAsset, type FxProvider, fxGraph, fxKey } from "../../shared/export/fx.ts";
import { flush, intact } from "./durable.ts";

/**
 * The fixed effect pictures of the export (shape, ring, shadow), rendered once per key as a PNG
 * in userData/cache/fx and reused by every segment and every later export. Each one is flushed
 * to the disk before it gets its name, and one that is not whole is made again.
 */

export type RunFfmpeg = (args: string[], options?: { key?: string }) => Promise<unknown>;

const fileOf = (dir: string, asset: FxAsset): string =>
  join(dir, `${createHash("sha256").update(fxKey(asset)).digest("hex").slice(0, 32)}.png`);

export class FxAssets {
  private readonly ready = new Map<string, string>();
  private readonly making = new Map<string, Promise<string>>();

  private readonly dir: string;
  private readonly run: RunFfmpeg;

  constructor(dir: string, run: RunFfmpeg) {
    this.dir = dir;
    this.run = run;
  }

  /** For the plan builder: the PNG when it is already there, null otherwise. */
  readonly provider: FxProvider = (asset) => this.ready.get(fxKey(asset)) ?? null;

  /** Makes sure every asset has its PNG. */
  async ensure(assets: readonly FxAsset[]): Promise<void> {
    await Promise.all(assets.map((a) => this.one(a)));
  }

  private one(asset: FxAsset): Promise<string> {
    const key = fxKey(asset);
    const known = this.ready.get(key);
    if (known) return Promise.resolve(known);
    let making = this.making.get(key);
    if (!making) {
      making = this.render(asset).finally(() => this.making.delete(key));
      this.making.set(key, making);
    }
    return making;
  }

  private async render(asset: FxAsset): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const path = fileOf(this.dir, asset);
    if (!(await whole(path))) {
      const part = path.replace(/\.png$/, ".part.png");
      try {
        await this.run(
          [
            "-y",
            "-v",
            "error",
            "-nostdin",
            "-filter_complex",
            fxGraph(asset, "30", "fx"),
            "-map",
            "[fx]",
            "-frames:v",
            "1",
            part,
          ],
          { key: "fx" },
        );
        await flush(part);
        await rename(part, path);
      } finally {
        await rm(part, { force: true });
      }
    }
    this.ready.set(fxKey(asset), path);
    return path;
  }
}

/** Whether the picture is there and whole. */
async function whole(path: string): Promise<boolean> {
  try {
    return await intact(path, "png");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/** A provider that records what a plan asks for (and answers "not yet"). */
export function collectingProvider(): { provider: FxProvider; wanted: FxAsset[] } {
  const wanted: FxAsset[] = [];
  return {
    wanted,
    provider: (asset) => {
      wanted.push(asset);
      return null;
    },
  };
}
