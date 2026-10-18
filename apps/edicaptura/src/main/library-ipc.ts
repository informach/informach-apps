import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "@informach/edi-desktop/files";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import type { CaptureDocument } from "../domain/document.ts";
import { metadataUpdateSchema } from "../domain/document.ts";
import { FinalExport } from "./final-export.mts";
import type { Files } from "./portable.ts";
import {
  copyLibraryRoot,
  decodeArchive,
  encodeArchive,
  MAX_ARCHIVE,
  snapshot,
  validateLibraryRoot,
  verifiedCopy,
} from "./portable.ts";
import { decodeRaster } from "./raster-codec.mts";
import { copyVideo } from "./video-files.ts";

export const preferencesSchema = z.strictObject({
  version: z.literal(1).default(1),
  root: z.string().refine(path.isAbsolute),
  destinations: z.array(z.string().refine(path.isAbsolute)).max(12).default([]),
  tray: z.boolean().default(false),
  startWithWindows: z.boolean().default(false),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export async function readPreferences(file: string, root: string): Promise<Preferences> {
  try {
    return preferencesSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return preferencesSchema.parse({ root });
    throw new Error(
      "Preferências da biblioteca danificadas. Preserve o arquivo library-settings.json antes de recuperá-lo.",
      { cause: error },
    );
  }
}
interface LibraryPort {
  root: string;
  file(id: string, ext: string): string;
  read(id: string): Promise<CaptureDocument & { dataUrl: string }>;
  save(data: Record<string, unknown>, bytes?: Buffer): Promise<CaptureDocument>;
  updateMetadata(data: unknown): Promise<CaptureDocument>;
  duplicate(id: string): Promise<CaptureDocument>;
  importPortable(files: Files): Promise<CaptureDocument>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  refreshIndex(): Promise<void>;
}
const uuid = z.string().uuid();
export const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("preferences") }),
  z.strictObject({ action: z.literal("refresh") }),
  z.strictObject({ action: z.literal("reveal-root") }),
  z.strictObject({
    action: z.literal("preference"),
    tray: z.boolean(),
    startWithWindows: z.boolean(),
  }),
  z.strictObject({ action: z.literal("destination-add") }),
  z.strictObject({
    action: z.literal("destination-remove"),
    index: z.number().int().min(0).max(11),
  }),
  z.strictObject({ action: z.literal("root"), mode: z.enum(["copy", "open"]) }),
  z.strictObject({ action: z.literal("backup") }),
  z.strictObject({ action: z.literal("restore") }),
  z.strictObject({ action: z.literal("portable-export"), id: uuid }),
  z.strictObject({ action: z.literal("portable-import") }),
  z.strictObject({ action: z.literal("reveal"), id: uuid }),
  z.strictObject({
    action: z.literal("bulk"),
    ids: z.array(uuid).min(1).max(60),
    operation: z.enum(["trash", "restore", "favorite", "unfavorite", "duplicate", "metadata"]),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    collection: z.string().trim().max(80).optional(),
  }),
]);
export function imageBytes(
  bytes: Uint8Array,
  nativeImage: typeof import("electron").nativeImage,
  maxBytes = 50_000_000,
) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maxBytes)
    throw new Error("Imagem inválida ou maior que o limite de bytes.");
  const image = nativeImage.createFromBuffer(Buffer.from(bytes));
  const size = image.getSize();
  if (image.isEmpty() || size.width * size.height > 100_000_000)
    throw new Error("Imagem inválida ou maior que 100 megapixels.");
  return image;
}
export function validateWebm(bytes: Uint8Array) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 12 ||
    bytes.length > 400_000_000 ||
    Buffer.from(bytes.subarray(0, 4)).toString("hex") !== "1a45dfa3" ||
    !Buffer.from(bytes.subarray(0, 4096)).includes(Buffer.from("webm"))
  )
    throw new Error(
      "Escolha um WebM válido de até 400 MB. O original é preservado. A biblioteca lê duração e miniatura. A importação aceita somente WebM; o editor exporta o intervalo em MP4 ou GIF.",
    );
}
export const importBytesSchema = z.strictObject({
  name: z.string().min(1).max(120),
  bytes: z.instanceof(Uint8Array),
});
interface Context {
  electron: Pick<
    typeof import("electron"),
    "clipboard" | "dialog" | "nativeImage" | "shell" | "BrowserWindow"
  >;
  handle(name: string, roles: string[], fn: (...args: unknown[]) => unknown): void;
  editor(): BrowserWindow;
  library(): LibraryPort;
  preferences: Preferences;
  settingsPath: string;
  assertAccess(): void;
  canSwitch(): boolean;
  isSwitching?(): boolean;
  switching(value: boolean): void;
  replaceRoot(root: string): Promise<void>;
  applyPreferences(prefs: Preferences): void;
  thumbnail(image: Electron.NativeImage): string;
}
export function registerLibraryIpc(ctx: Context) {
  const { clipboard, dialog, nativeImage, shell } = ctx.electron;
  let prefs = ctx.preferences;
  let workflowBusy = false;
  const finalExport = new FinalExport();
  const batchDestinations = new Map<string, string>();
  const writePrefs = async (next: Preferences) => {
    await atomicWrite(ctx.settingsPath, JSON.stringify(preferencesSchema.parse(next)));
    prefs = next;
    return structuredClone(prefs);
  };
  const chooseFolder = async (title: string) => {
    const choice = await dialog.showOpenDialog(ctx.editor(), {
      title,
      properties: ["openDirectory", "createDirectory"],
    });
    ctx.assertAccess();
    return choice.canceled ? null : choice.filePaths[0] || null;
  };
  const archiveInput = async (kind: "project" | "library") => {
    const choice = await dialog.showOpenDialog(ctx.editor(), {
      title: kind === "project" ? "Importar projeto editável" : "Restaurar backup",
      properties: ["openFile"],
      filters: [
        {
          name: "EdiCaptura portátil",
          extensions: [kind === "project" ? "edicapture" : "edilibrary"],
        },
      ],
    });
    if (choice.canceled) return null;
    ctx.assertAccess();
    const file = choice.filePaths[0];
    if (!file || (await fs.stat(file)).size > MAX_ARCHIVE + 10_000_000)
      throw new Error("Arquivo excede o limite de 800 MB.");
    return decodeArchive(await fs.readFile(file), kind).files;
  };
  ctx.handle("library:workflow", ["editor"], async (value) => {
    if (workflowBusy) throw new Error("Outra operação da biblioteca está em andamento.");
    workflowBusy = true;
    try {
      const action = actionSchema.parse(value),
        lib = ctx.library();
      switch (action.action) {
        case "reveal-root": {
          const error = await shell.openPath(lib.root);
          if (error) throw new Error(error);
          return true;
        }
        case "refresh":
          await lib.refreshIndex();
          return true;
        case "preferences":
          return structuredClone(prefs);
        case "preference": {
          const next = { ...prefs, tray: action.tray, startWithWindows: action.startWithWindows };
          ctx.applyPreferences(next);
          try {
            return await writePrefs(next);
          } catch (cause) {
            ctx.applyPreferences(prefs);
            throw cause;
          }
        }
        case "destination-add": {
          const directory = await chooseFolder("Adicionar destino favorito");
          if (!directory) return null;
          return writePrefs({
            ...prefs,
            destinations: [...new Set([...prefs.destinations, directory])].slice(0, 12),
          });
        }
        case "destination-remove":
          return writePrefs({
            ...prefs,
            destinations: prefs.destinations.filter((_, i) => i !== action.index),
          });
        case "reveal": {
          const target = lib.file(action.id, "json");
          await fs.access(target);
          shell.showItemInFolder(target);
          return true;
        }
        case "bulk": {
          const succeeded: string[] = [],
            failed: { id: string; message: string }[] = [];
          for (const id of [...new Set(action.ids)]) {
            try {
              ctx.assertAccess();
              if (action.operation === "duplicate") await lib.duplicate(id);
              else
                await lib.updateMetadata(
                  metadataUpdateSchema.parse({
                    id,
                    ...(action.operation === "trash"
                      ? { deletedAt: new Date().toISOString() }
                      : action.operation === "restore"
                        ? { deletedAt: null }
                        : action.operation === "favorite"
                          ? { favorite: true }
                          : action.operation === "unfavorite"
                            ? { favorite: false }
                            : {
                                ...(action.tags !== undefined ? { tags: action.tags } : {}),
                                ...(action.collection !== undefined
                                  ? { collection: action.collection }
                                  : {}),
                              }),
                  }),
                );
              succeeded.push(id);
            } catch (error) {
              failed.push({ id, message: error instanceof Error ? error.message : String(error) });
            }
          }
          return { succeeded, failed };
        }
        case "portable-import": {
          const files = await archiveInput("project");
          if (!files) return null;
          const doc = await lib.importPortable(files);
          return lib.read(doc.id);
        }
        case "backup":
        case "portable-export": {
          const kind = action.action === "backup" ? "library" : "project";
          const result = await dialog.showSaveDialog(ctx.editor(), {
            title:
              kind === "library"
                ? "Backup completo da biblioteca"
                : "Salvar projeto editável portátil",
            defaultPath: kind === "library" ? "Biblioteca.edilibrary" : "Captura.edicapture",
            filters: [
              {
                name: "EdiCaptura portátil",
                extensions: [kind === "library" ? "edilibrary" : "edicapture"],
              },
            ],
          });
          if (result.canceled || !result.filePath) return null;
          ctx.assertAccess();
          const output = result.filePath;
          if (
            path.relative(lib.root, path.resolve(output)).split(path.sep)[0] !== ".." &&
            !path.isAbsolute(path.relative(lib.root, path.resolve(output)))
          )
            throw new Error("Salve o backup fora da biblioteca.");
          return lib.transaction(async () => {
            const files = await snapshot(
              lib.root,
              action.action === "portable-export" ? action.id : undefined,
            );
            await atomicWrite(output, encodeArchive(files, kind));
            return output;
          });
        }
        case "restore":
        case "root": {
          if (!ctx.canSwitch()) throw new Error("Encerre a captura antes de trocar a biblioteca.");
          const archive = action.action === "restore" ? await archiveInput("library") : null;
          if (action.action === "restore" && !archive) return null;
          const directory = await chooseFolder(
            action.action === "restore"
              ? "Pasta vazia para restaurar; a biblioteca atual será preservada"
              : action.mode === "copy"
                ? "Pasta vazia para copiar a biblioteca; a origem será preservada"
                : "Escolher biblioteca existente",
          );
          if (!directory) return null;
          if (!ctx.canSwitch())
            throw new Error("Uma captura foi iniciada. Encerre antes de trocar a biblioteca.");
          const relative = path.relative(lib.root, path.resolve(directory));
          if (
            !relative ||
            (!relative.startsWith(`..${path.sep}`) &&
              relative !== ".." &&
              !path.isAbsolute(relative))
          )
            throw new Error("Escolha uma pasta fora da biblioteca atual.");
          ctx.switching(true);
          try {
            await lib.transaction(async () => {
              if (archive) await verifiedCopy(archive, directory);
              else if (action.action === "root" && action.mode === "copy")
                await copyLibraryRoot(lib.root, directory);
              else await validateLibraryRoot(directory);
              await ctx.replaceRoot(directory);
              try {
                await writePrefs({ ...prefs, root: directory });
              } catch (cause) {
                await ctx.replaceRoot(lib.root);
                throw cause;
              }
            });
            return structuredClone(prefs);
          } finally {
            ctx.switching(false);
          }
        }
      }
    } finally {
      workflowBusy = false;
    }
  });
  const importMedia = async (value: unknown) => {
    const { name, bytes } = importBytesSchema.parse(value),
      lib = ctx.library();
    const extension = path.extname(name).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".webm"].includes(extension))
      throw new Error(
        extension === ".snagx"
          ? "SNAGX preserva objetos no Snagit. Exporte PNG/JPEG/WebP no Snagit para importar a imagem final; objetos não serão editáveis."
          : "Importe PNG, JPEG, WebP ou WebM.",
      );
    ctx.assertAccess();
    let doc: CaptureDocument;
    if (extension === ".webm") {
      validateWebm(bytes);
      doc = await lib.save(
        { name, kind: "video", sourceApp: "Importado", media: { status: "pending" } },
        Buffer.from(bytes),
      );
    } else {
      const image = await decodeRaster(bytes, ctx.electron);
      if (ctx.library() !== lib || ctx.isSwitching?.())
        throw new Error(
          "Biblioteca mudou durante a importação. Importe novamente na biblioteca desejada; o arquivo de origem foi preservado.",
        );
      doc = await lib.save(
        { name, kind: "image", sourceApp: "Importado", preview: ctx.thumbnail(image) },
        image.toPNG(),
      );
    }
    return lib.read(doc.id);
  };
  ctx.handle("media:import", ["editor"], importMedia);
  ctx.handle("file:copy-path", ["editor"], async (...args) => {
    z.tuple([]).parse(args);
    const exported = await finalExport.validated();
    ctx.assertAccess();
    clipboard.writeText(exported.file);
    return exported.file;
  });
  ctx.handle("file:copy-final", ["editor"], (...args) => {
    z.tuple([]).parse(args);
    return finalExport.copyFile(ctx.assertAccess);
  });
  ctx.handle("file:batch-export", ["editor"], async (value) => {
    const { items, destination } = z
      .strictObject({
        items: z
          .array(
            z.strictObject({
              id: uuid,
              bytes: z.instanceof(Uint8Array).optional(),
            }),
          )
          .min(1)
          .max(60),
        destination: z.string().uuid(),
      })
      .parse(value);
    const directory = batchDestinations.get(destination);
    if (!directory) throw new Error("Destino de exportação expirado. Escolha novamente.");
    const succeeded: string[] = [],
      failed: { id: string; message: string }[] = [];
    for (const item of items) {
      try {
        ctx.assertAccess();
        const doc = await ctx.library().read(item.id);
        if (doc.deletedAt) throw new Error("Restaure a captura antes de exportá-la.");
        if (doc.kind === "video" && doc.videoRecipe)
          throw new Error("Vídeo aparado: abra no editor e exporte o intervalo em MP4 ou GIF.");
        if (doc.kind === "image" && !item.bytes) throw new Error("Renderização final ausente.");
        const bytes =
          doc.kind === "video"
            ? null
            : imageBytes(item.bytes || new Uint8Array(), nativeImage, 400_000_000).toPNG();
        const stem =
          doc.name
            .split("")
            .map((character) =>
              character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character,
            )
            .join("")
            .replace(/[. ]+$/g, "")
            .slice(0, 80) || "Captura";
        const base = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)
          ? `Captura-${stem}`
          : stem;
        let suffix = 0,
          target: string;
        for (;;) {
          target = path.join(
            directory,
            `${base}-${doc.id.slice(0, 8)}${suffix ? `-${suffix}` : ""}.${doc.kind === "video" ? "webm" : "png"}`,
          );
          try {
            if (doc.kind === "video")
              await copyVideo(ctx.library().file(item.id, "webm"), target, true);
            else if (bytes) await fs.writeFile(target, bytes, { flag: "wx" });
            break;
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "EEXIST") {
              suffix++;
              continue;
            }
            throw error;
          }
        }
        await finalExport.remember(target, doc.kind === "video" ? "webm" : "png");
        succeeded.push(target);
      } catch (error) {
        failed.push({
          id: item.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { succeeded, failed };
  });
  ctx.handle("file:batch-destination", ["editor"], async (value) => {
    const index = z.number().int().min(-1).max(11).parse(value);
    const directory =
      index === -1
        ? await chooseFolder("Exportar arquivos finais selecionados")
        : prefs.destinations[index];
    if (!directory) return null;
    await fs.access(directory, fs.constants.W_OK);
    const token = randomUUID();
    if (batchDestinations.size >= 8) {
      const oldest = batchDestinations.keys().next().value;
      if (oldest) batchDestinations.delete(oldest);
    }
    batchDestinations.set(token, directory);
    return token;
  });
  ctx.handle("file:batch-finish", ["editor"], (value) =>
    batchDestinations.delete(uuid.parse(value)),
  );
  return {
    preferences: () => prefs,
    importMedia,
    rememberExport: finalExport.remember.bind(finalExport),
  };
}
