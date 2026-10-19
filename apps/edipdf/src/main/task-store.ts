import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertBatchAdvance } from "../shared/batch-format.ts";
import {
  compressionInputSchema,
  compressionSettingsSchema,
  compressionSourceSchema,
  sameCompressionSource,
} from "../shared/compression-task-format.ts";
import {
  assertPrintRestriction,
  localTaskRequestSchema,
  type PendingCompressionInput,
  type PendingLocalTask,
  type PendingTaskList,
  taskDisplayName,
  taskResultSchema,
} from "../shared/task-format.ts";
import { atomicWrite } from "./files.ts";
import type { LocalCodec } from "./validated-store.ts";

const MAX_RECORD = 192 * 1024 * 1024,
  MAX_METADATA = 64 * 1024 * 1024,
  MAX_TOTAL = 512 * 1024 * 1024;
const b64 = z
  .string()
  .max(180 * 1024 * 1024)
  .base64();
const refSchema = z.strictObject({
  id: z.uuid(),
  hash: z.string().regex(/^[a-f\d]{64}$/),
  length: z
    .number()
    .int()
    .positive()
    .max(128 * 1024 * 1024),
});
type BlobRef = z.infer<typeof refSchema>;
const common = { request: localTaskRequestSchema, createdAt: z.number().int().nonnegative() };
const resultMetadata = {
  pages: z.number().int().positive().max(1000),
  warnings: z.array(z.string().max(2000)).max(1000),
  extension: taskResultSchema.shape.extension,
  detail: taskResultSchema.shape.detail,
  table: taskResultSchema.shape.table,
};
const legacySchema = z.strictObject({
  version: z.literal(1),
  ...common,
  result: z.strictObject({ ...resultMetadata, bytes: b64, pdf: b64 }),
});
const manifestSchema = z.strictObject({
  version: z.literal(2),
  ...common,
  result: z.strictObject({ ...resultMetadata, bytes: refSchema, pdf: refSchema }),
});
const storedSchema = z.discriminatedUnion("version", [legacySchema, manifestSchema]);
const inputRecordSchema = z.strictObject({
  version: z.literal(1),
  ...common,
  settings: compressionSettingsSchema,
  source: z.union([
    compressionSourceSchema.options[0],
    compressionSourceSchema.options[1].extend({ data: refSchema }),
  ]),
});
const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fingerprint = (value: Awaited<ReturnType<typeof stat>>) =>
  `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
export function createTaskStore(root: string, codec: LocalCodec) {
  let tail = Promise.resolve();
  const verified = new Map<string, { fingerprint: string; hash: string; length: number }>();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const path = (id: string) => join(root, `${z.uuid().parse(id)}.bin`);
  const inputPath = (id: string) => join(root, `${z.uuid().parse(id)}.input`);
  const blobName = (id: string, ref: BlobRef) => `${z.uuid().parse(id)}-${ref.id}.blob`;
  const files = async () => {
    try {
      return await readdir(root);
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  };
  const owner = (name: string): string | undefined => {
    if (
      name.startsWith(".") &&
      name.endsWith(".tmp") &&
      z.uuid().safeParse(name.slice(-40, -4)).success
    )
      return owner(name.slice(1, -41));
    const id = name.slice(0, 36);
    return z.uuid().safeParse(id).success &&
      (name === `${id}.bin` ||
        name === `${id}.input` ||
        (name.startsWith(`${id}-`) &&
          name.endsWith(".blob") &&
          z.uuid().safeParse(name.slice(37, -5)).success))
      ? id
      : undefined;
  };
  const readStored = async (id: string) => {
    if ((await stat(path(id))).size > MAX_RECORD)
      throw new Error("Resultado protegido excede o limite local.");
    const record = storedSchema.parse(JSON.parse(codec.decode(await readFile(path(id)))));
    if (record.request.id !== id)
      throw new Error("Identidade do resultado protegido não corresponde ao arquivo.");
    assertPrintRestriction(record.request, record.result.detail);
    if (
      record.result.extension !== record.request.extension ||
      (record.request.kind === "conversion"
        ? record.result.detail !== undefined
        : record.result.detail?.kind !== record.request.kind)
    )
      throw new Error("O resultado protegido não corresponde ao tipo da tarefa.");
    if (
      record.version === 2 &&
      (record.result.bytes.length > 64 * 1024 * 1024 ||
        record.result.bytes.length + record.result.pdf.length > 128 * 1024 * 1024 ||
        (record.result.bytes.id === record.result.pdf.id &&
          (record.result.bytes.hash !== record.result.pdf.hash ||
            record.result.bytes.length !== record.result.pdf.length)))
    )
      throw new Error("Referências binárias inconsistentes no resultado protegido.");
    return record;
  };
  const readBlob = async (id: string, ref: BlobRef): Promise<Uint8Array> => {
    const name = blobName(id, ref),
      target = join(root, name),
      before = await stat(target);
    if (!before.isFile() || before.size > MAX_RECORD)
      throw new Error("Bytes protegidos excedem o limite local.");
    const encoded = codec.decode(await readFile(target));
    const bytes = new Uint8Array(Buffer.from(b64.parse(encoded), "base64"));
    if (
      bytes.length !== ref.length ||
      digest(bytes) !== ref.hash ||
      fingerprint(before) !== fingerprint(await stat(target))
    )
      throw new Error("Bytes protegidos incompletos, alterados ou com digest diferente.");
    verified.set(name, { fingerprint: fingerprint(before), hash: ref.hash, length: ref.length });
    return bytes;
  };
  const verifyBlob = async (id: string, ref: BlobRef) => {
    const name = blobName(id, ref),
      current = await stat(join(root, name));
    const checked = verified.get(name);
    if (
      checked?.fingerprint !== fingerprint(current) ||
      checked.hash !== ref.hash ||
      checked.length !== ref.length
    )
      await readBlob(id, ref);
  };
  const readInputStored = async (id: string) => {
    if ((await stat(inputPath(id))).size > MAX_METADATA)
      throw new Error("Entrada protegida excede o limite local.");
    const record = inputRecordSchema.parse(JSON.parse(codec.decode(await readFile(inputPath(id)))));
    if (
      record.request.id !== id ||
      record.request.kind !== "compression" ||
      !record.request.inputIdentity ||
      !sameCompressionSource(record.request.inputIdentity, record.source)
    )
      throw new Error("Entrada protegida não corresponde à tarefa.");
    if (
      record.source.kind === "snapshot" &&
      (record.source.data.hash !== record.source.sha256 ||
        record.source.data.length !== record.source.length)
    )
      throw new Error("Referência da cópia de entrada inconsistente.");
    return record;
  };
  const optionalInput = async (id: string) => {
    try {
      return await readInputStored(id);
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  };
  const inspectInput = async (id: string) => {
    try {
      return { record: await optionalInput(id), damaged: false };
    } catch {
      return { record: undefined, damaged: true };
    }
  };
  const usage = async () => {
    let total = 0;
    for (const name of await files()) total += (await stat(join(root, name))).size;
    return total;
  };
  const persistBlob = async (
    id: string,
    bytes: Uint8Array,
    references: BlobRef[],
    created: string[],
    beforeCommit?: () => Promise<void>,
  ): Promise<BlobRef> => {
    const hash = digest(bytes),
      existing = references.find((ref) => ref.hash === hash && ref.length === bytes.length);
    if (existing) {
      await verifyBlob(id, existing);
      return existing;
    }
    const ref = { id: randomUUID(), hash, length: bytes.length },
      name = blobName(id, ref),
      encoded = codec.encode(Buffer.from(bytes).toString("base64"));
    if (encoded.length > MAX_RECORD || (await usage()) + encoded.length > MAX_TOTAL)
      throw new Error("Resultados protegidos excedem 512 MB. Descarte pendências antigas.");
    await atomicWrite(join(root, name), encoded, beforeCommit);
    created.push(name);
    verified.set(name, {
      fingerprint: fingerprint(await stat(join(root, name))),
      hash: ref.hash,
      length: ref.length,
    });
    references.push(ref);
    return ref;
  };
  const validate = (task: PendingLocalTask): PendingLocalTask => {
    const request = localTaskRequestSchema.parse(task.request),
      result = taskResultSchema.parse(task.result);
    if (
      result.extension !== request.extension ||
      result.bytes.length + result.pdf.length > 128 * 1024 * 1024 ||
      (request.kind === "conversion"
        ? result.detail !== undefined
        : result.detail?.kind !== request.kind)
    )
      throw new Error("Resultado não corresponde à tarefa ou excede o limite de preservação.");
    assertPrintRestriction(request, result.detail);
    return { request, result, createdAt: task.createdAt };
  };
  const load = async (id: string): Promise<PendingLocalTask> => {
    const record = await readStored(id);
    const bytes =
      record.version === 1
        ? new Uint8Array(Buffer.from(record.result.bytes, "base64"))
        : await readBlob(id, record.result.bytes);
    const pdf =
      record.version === 1
        ? new Uint8Array(Buffer.from(record.result.pdf, "base64"))
        : record.result.pdf.id === record.result.bytes.id
          ? bytes
          : await readBlob(id, record.result.pdf);
    return validate({
      request: record.request,
      createdAt: record.createdAt,
      result: taskResultSchema.parse({ ...record.result, bytes, pdf }),
    });
  };
  const removeFile = async (name: string) => {
    try {
      await unlink(join(root, name));
      verified.delete(name);
    } catch (error) {
      if (!missing(error)) throw error;
    }
  };
  return {
    loadInput: (id: string): Promise<PendingCompressionInput> =>
      serial(async () => {
        const record = await readInputStored(id);
        const source =
          record.source.kind === "file"
            ? record.source
            : {
                kind: record.source.kind,
                sha256: record.source.sha256,
                length: record.source.length,
              };
        const bytes =
          record.source.kind === "snapshot" ? await readBlob(id, record.source.data) : undefined;
        return {
          request: record.request,
          createdAt: record.createdAt,
          input: compressionInputSchema.parse({
            kind: "compression",
            source,
            settings: record.settings,
            ...(bytes ? { bytes } : {}),
          }),
        };
      }),
    saveInput: (raw: PendingCompressionInput, beforeCommit?: () => Promise<void>) =>
      serial(async () => {
        const request = localTaskRequestSchema.parse(raw.request),
          input = compressionInputSchema.parse(raw.input),
          id = request.id;
        if (
          request.kind !== "compression" ||
          !request.inputIdentity ||
          !sameCompressionSource(request.inputIdentity, input.source) ||
          (input.bytes && digest(input.bytes) !== input.source.sha256)
        )
          throw new Error("A entrada não corresponde à origem vinculada à tarefa.");
        await mkdir(root, { recursive: true });
        const current = await files(),
          ids = new Set(current.map(owner).filter((id): id is string => !!id));
        if (ids.size >= 20 && !ids.has(id))
          throw new Error("Há tarefas pendentes demais. Descarte entradas antigas.");
        const old = await optionalInput(id),
          references: BlobRef[] = old?.source.kind === "snapshot" ? [old.source.data] : [],
          created: string[] = [];
        let committed = false;
        try {
          let source: z.infer<typeof inputRecordSchema>["source"];
          if (input.source.kind === "snapshot") {
            if (!input.bytes) throw new Error("Cópia da entrada ausente.");
            source = {
              ...input.source,
              data: await persistBlob(id, input.bytes, references, created, beforeCommit),
            };
          } else source = input.source;
          const record = inputRecordSchema.parse({
              version: 1,
              request,
              source,
              settings: input.settings,
              createdAt: raw.createdAt,
            }),
            encoded = codec.encode(JSON.stringify(record));
          const previousSize = current.includes(`${id}.input`)
            ? (await stat(inputPath(id))).size
            : 0;
          if (
            encoded.length > MAX_METADATA ||
            (await usage()) - previousSize + encoded.length > MAX_TOTAL
          )
            throw new Error("Entrada protegida excede os limites locais.");
          await atomicWrite(inputPath(id), encoded, beforeCommit);
          committed = true;
        } catch (error) {
          if (!committed) {
            const failures: unknown[] = [];
            for (const name of created)
              try {
                await removeFile(name);
              } catch (failure) {
                failures.push(failure);
              }
            if (failures.length)
              throw new AggregateError(
                [error, ...failures],
                "A entrada falhou e conservou arquivos protegidos incompletos. Descarte-os pela janela Tarefas.",
              );
          }
          throw error;
        }
      }),
    load: (id: string) => serial(() => load(id)),
    save: (raw: PendingLocalTask, beforeCommit?: () => Promise<void>) =>
      serial(async () => {
        const task = validate(raw),
          id = task.request.id;
        await mkdir(root, { recursive: true });
        const current = await files(),
          ids = new Set(current.map(owner).filter((id): id is string => !!id));
        if (ids.size >= 20 && !ids.has(id))
          throw new Error("Há resultados pendentes demais. Revise ou descarte tarefas antigas.");
        let old: z.infer<typeof storedSchema> | undefined;
        try {
          old = await readStored(id);
        } catch (error) {
          if (!missing(error)) throw error;
        }
        if (
          old &&
          (old.request.kind !== task.request.kind ||
            old.request.extension !== task.request.extension ||
            Boolean(old.request.printOnly) !== Boolean(task.request.printOnly))
        )
          throw new Error("O identificador pertence a outra tarefa protegida.");
        if (old?.result.detail?.kind === "batch" && task.result.detail?.kind === "batch")
          assertBatchAdvance(old.result.detail, task.result.detail);
        const inspected = await inspectInput(id),
          input = inspected.record;
        const references: BlobRef[] = [
          ...(old?.version === 2 ? [old.result.bytes, old.result.pdf] : []),
          ...(input?.source.kind === "snapshot" ? [input.source.data] : []),
        ];
        const created: string[] = [];
        let committed = false;
        const persist = (bytes: Uint8Array) =>
          persistBlob(id, bytes, references, created, beforeCommit);
        try {
          const bytes = await persist(task.result.bytes),
            pdf = await persist(task.result.pdf);
          if (
            task.result.detail?.kind === "batch" &&
            (pdf.hash !== task.result.detail.sourceSha256 ||
              task.result.pages !== task.result.detail.sourcePages)
          )
            throw new Error("A revisão PDF não corresponde à origem do lote protegido.");
          const record = manifestSchema.parse({
            version: 2,
            request: task.request,
            createdAt: task.createdAt,
            result: { ...task.result, bytes, pdf },
          });
          const encoded = codec.encode(JSON.stringify(record));
          const previousSize = current.includes(`${id}.bin`) ? (await stat(path(id))).size : 0;
          if (
            encoded.length > MAX_METADATA ||
            (await usage()) - previousSize + encoded.length > MAX_TOTAL
          )
            throw new Error("Metadados protegidos excedem os limites locais de armazenamento.");
          await atomicWrite(path(id), encoded, beforeCommit);
          committed = true;
          const retained = new Set([blobName(id, bytes), blobName(id, pdf)]);
          if (input?.source.kind === "snapshot") retained.add(blobName(id, input.source.data));
          for (const name of current)
            if (
              !inspected.damaged &&
              owner(name) === id &&
              name.endsWith(".blob") &&
              !retained.has(name)
            )
              await removeFile(name);
        } catch (error) {
          if (!committed) {
            const failures: unknown[] = [];
            for (const name of created)
              try {
                await removeFile(name);
              } catch (cleanup) {
                failures.push(cleanup);
              }
            if (failures.length)
              throw new AggregateError(
                [error, ...failures],
                "A tarefa falhou e conservou arquivos protegidos incompletos. Descarte-os pela janela Tarefas.",
              );
          }
          throw error;
        }
      }),
    remove: (id: string) =>
      serial(async () => {
        z.uuid().parse(id);
        for (const name of await files())
          if (owner(name) === id && name !== `${id}.bin`) await removeFile(name);
        await removeFile(`${id}.bin`);
      }),
    list: (): Promise<PendingTaskList> =>
      serial(async () => {
        const tasks: PendingTaskList["tasks"] = [],
          errors: PendingTaskList["errors"] = [];
        const names = await files(),
          ids = new Set(names.map(owner).filter((id): id is string => !!id));
        for (const id of ids)
          try {
            const inspected = await inspectInput(id),
              input = inspected.record;
            if (inspected.damaged && !names.includes(`${id}.bin`))
              throw new Error("Entrada protegida ilegível.");
            if (!names.includes(`${id}.bin`) && input) {
              if (input.source.kind === "snapshot") await verifyBlob(id, input.source.data);
              tasks.push({
                id,
                kind: "compression",
                state: "processing",
                label: input.request.label,
                name: input.request.defaultName,
                extension: input.request.extension,
                createdAt: input.createdAt,
                bytes: input.source.length,
              });
              continue;
            }
            const value = await readStored(id);
            if (value.version === 2) {
              await verifyBlob(id, value.result.bytes);
              await verifyBlob(id, value.result.pdf);
            } else await load(id);
            tasks.push({
              id,
              kind: value.request.kind,
              state:
                (value.result.detail?.kind === "ocr" &&
                  value.result.detail.stage === "recognizing") ||
                (value.result.detail?.kind === "printing" &&
                  value.result.detail.stage !== "output") ||
                (value.result.detail?.kind === "scanning" &&
                  value.result.detail.stage === "acquiring") ||
                (value.result.detail?.kind === "batch" &&
                  value.result.detail.stage === "processing")
                  ? "processing"
                  : "review",
              label: value.request.label,
              name: taskDisplayName(value.request),
              extension: value.result.extension,
              createdAt: value.createdAt,
              bytes:
                value.version === 2
                  ? value.result.bytes.length
                  : Buffer.from(value.result.bytes, "base64").length,
            });
            const retained = new Set(
              value.version === 2
                ? [`${id}.bin`, blobName(id, value.result.bytes), blobName(id, value.result.pdf)]
                : [`${id}.bin`],
            );
            if (input) {
              retained.add(`${id}.input`);
              if (input.source.kind === "snapshot") retained.add(blobName(id, input.source.data));
            }
            if (
              inspected.damaged ||
              names.some((name) => owner(name) === id && !retained.has(name))
            )
              errors.push({
                id,
                message:
                  "Esta tarefa conserva arquivos protegidos de uma etapa incompleta. Descartar a tarefa também remove esses arquivos.",
              });
          } catch {
            errors.push({
              id,
              message:
                "O resultado está ilegível ou incompleto e foi preservado. Ele continua ocupando espaço até ser descartado explicitamente.",
            });
          }
        tasks.sort((a, b) => b.createdAt - a.createdAt);
        return { tasks, errors };
      }),
  };
}
