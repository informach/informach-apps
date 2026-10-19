import { parentPort } from "node:worker_threads";
import { z } from "zod";
import {
  alignScroll,
  axisSchema,
  cropScroll,
  marginsSchema,
  scrollBudget,
  scrollDimensions,
  scrollSignature,
  signatureDifference,
  stitchScroll,
} from "../domain/scroll.ts";

export const workSchema = z
  .object({
    session: z.string().uuid(),
    request: z.number().int().positive(),
    op: z.enum(["analyze", "preview", "stitch", "review"]),
    axis: axisSchema,
    margins: marginsSchema,
    frames: z
      .array(
        z
          .object({
            width: z.number().int().positive().max(30000),
            height: z.number().int().positive().max(30000),
            bitmap: z.instanceof(Uint8Array),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    cuts: z.array(z.number().int().min(0)).max(30),
    retainedBytes: z
      .number()
      .int()
      .min(0)
      .max(512 * 1024 * 1024),
  })
  .strict();
const port = parentPort;
if (port)
  port.on("message", (input: unknown) => {
    const parsed = workSchema.safeParse(input);
    if (!parsed.success) {
      port.postMessage({ error: "Solicitação de worker inválida." });
      return;
    }
    const job = parsed.data;
    try {
      // Validate before crop/output allocations; the client accounts for originals/undo/candidate too.
      const sizes = job.frames.map((f) => ({
        width: f.width - job.margins.left - job.margins.right,
        height: f.height - job.margins.top - job.margins.bottom,
      }));
      const size = scrollDimensions(sizes, job.cuts, job.axis);
      if (scrollBudget(job.frames, size) > job.retainedBytes)
        throw new Error("Reserva agregada insuficiente.");
      const frames = job.frames.map((f) => cropScroll(f, job.margins));
      const signatures = frames.map((f) => scrollSignature(f, job.axis));
      const seams = signatures.map((sig, i) =>
        i === 0
          ? { overlap: 0, confidence: 1, warning: "", automatic: true }
          : alignScroll(signatures[i - 1] ?? sig, sig),
      );
      if (job.op === "analyze") {
        const a = signatures[0],
          b = signatures[1];
        if (!a || !b || signatures.length !== 2) throw new Error("Par de trechos inválido.");
        port.postMessage({
          session: job.session,
          request: job.request,
          seams,
          difference: signatureDifference(a, b),
        });
      } else {
        const cuts =
          job.op === "review"
            ? seams.map((s, i) =>
                i && s.overlap < (job.axis === "vertical" ? size.height : size.width)
                  ? s.overlap
                  : 0,
              )
            : job.cuts;
        // Duplicate adjacent frames are preserved with a warning until explicitly removed.
        for (let i = 1; i < cuts.length; i++) {
          const f = frames[i];
          if (f && (cuts[i] ?? 0) >= (job.axis === "vertical" ? f.height : f.width)) cuts[i] = 0;
        }
        const dimensions = scrollDimensions(frames, cuts, job.axis);
        const result = stitchScroll(frames, cuts, job.axis, job.op !== "stitch");
        port.postMessage(
          { session: job.session, request: job.request, seams, dimensions, cuts, result },
          [result.bitmap.buffer],
        );
      }
    } catch (error) {
      port.postMessage({
        session: job.session,
        request: job.request,
        error: error instanceof Error ? error.message : "Falha no worker.",
      });
    }
  });
