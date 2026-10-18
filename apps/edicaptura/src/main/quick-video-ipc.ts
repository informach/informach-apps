import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NativeMedia, resolveNativeMedia } from "@informach/edi-desktop/native-media";
import { z } from "zod";
import { videoOutputSchema } from "../domain/quick-video.ts";
import { QuickVideo, type VideoLibrary } from "./quick-video.ts";
import type { VideoStreams } from "./video-stream.ts";

interface Context {
  app: Pick<typeof import("electron").app, "isPackaged" | "getAppPath" | "getPath">;
  handle(name: string, roles: string[], fn: (input: unknown) => unknown): void;
  library(): VideoLibrary;
  streams: VideoStreams;
  assertAccess(): void;
  beginJob(stop: () => Promise<void>): { check(): void; finish(): void };
  chooseDestination(name: string, format: string): Promise<string | null>;
  remember(file: string, format: "mp4" | "gif" | "png"): Promise<void>;
  progress(value: { jobId: string; ratio: number }): void;
}
export function registerQuickVideo(ctx: Context) {
  let service: QuickVideo | undefined;
  let preview: string | null = null;
  let operation: { id: string; canceled: boolean } | null = null;
  const get = () =>
    (service ??= new QuickVideo(
      new NativeMedia(
        resolveNativeMedia({
          packaged: ctx.app.isPackaged,
          resourcesPath: process.resourcesPath,
          developmentRoot: ctx.app.getAppPath(),
        }),
      ),
      join(ctx.app.getPath("userData"), "video-preview", randomUUID()),
    ));
  const cancel = async (id?: string) => {
    if (id && operation?.id !== id) return;
    if (operation) operation.canceled = true;
    await service?.cancel();
  };
  const authority = (lib: VideoLibrary) => {
    ctx.assertAccess();
    if (operation?.canceled) throw new Error("Operação de mídia cancelada.");
    if (ctx.library() !== lib) throw new Error("A biblioteca mudou durante a operação.");
  };
  ctx.handle("video:inspect", ["editor"], async (value) => {
    const id = z.string().uuid().parse(value),
      lib = ctx.library(),
      media = get();
    if (operation) throw new Error("Aguarde a operação de vídeo atual.");
    const job = ctx.beginJob(cancel);
    operation = { id: randomUUID(), canceled: false };
    try {
      return await media.inspect(lib, id, () => {
        job.check();
        authority(lib);
      });
    } finally {
      job.finish();
      operation = null;
    }
  });
  ctx.handle("video:output", ["editor"], async (value) => {
    const input = videoOutputSchema.parse(value),
      lib = ctx.library(),
      media = get();
    if (input.preview && input.format !== "gif") throw new Error("Preview disponível para GIF.");
    if (operation) throw new Error("Aguarde a operação de vídeo atual.");
    const job = ctx.beginJob(cancel);
    operation = { id: input.jobId, canceled: false };
    try {
      const doc = await lib.read(input.id);
      const target = input.preview ? null : await ctx.chooseDestination(doc.name, input.format);
      job.check();
      authority(lib);
      if (!input.preview && !target) return null;
      if (preview) {
        await ctx.streams.revokeFile(preview);
        await rm(preview, { force: true });
        preview = null;
      }
      const result = await media.output(
        lib,
        input,
        target,
        () => {
          job.check();
          authority(lib);
        },
        (ratio) => ctx.progress({ jobId: input.jobId, ratio }),
      );
      if (input.preview) {
        preview = result.file;
        return {
          ...result,
          file: undefined,
          url: await ctx.streams.grant(lib.root, input.id, result.file, "image/gif"),
        };
      }
      await ctx.remember(result.file, result.format);
      return result;
    } finally {
      job.finish();
      operation = null;
    }
  });
  ctx.handle("video:cancel", ["editor"], async (value) => cancel(z.string().uuid().parse(value)));
  return {
    busy: () => operation !== null,
    cancel,
    async close() {
      await cancel();
      if (preview) {
        await ctx.streams.revokeFile(preview);
        await rm(preview, { force: true });
        preview = null;
      }
    },
  };
}
