import { z } from "zod";
import {
  axisSchema,
  type Margins,
  marginsSchema,
  movingSize,
  NO_MARGINS,
  type ScrollAxis,
  type Seam,
  scrollAcquisitionBudget,
  scrollBudget,
  scrollDimensions,
  scrollPublicationBudget,
} from "../domain/scroll.ts";
import { type ScrollImage, type ScrollReply, ScrollWorker } from "./scroll-worker-client.ts";

export const scrollEditSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("configure"), axis: axisSchema, margins: marginsSchema }).strict(),
  z
    .object({
      op: z.literal("cut"),
      index: z.number().int().min(1).max(29),
      overlap: z.number().int().min(0).max(29999),
    })
    .strict(),
  z.object({ op: z.literal("remove"), index: z.number().int().min(0).max(29) }).strict(),
  z.object({ op: z.literal("undo") }).strict(),
  z.object({ op: z.literal("preview") }).strict(),
]);
type Snapshot = {
  images: ScrollImage[];
  cuts: number[];
  seams: Seam[];
  axis: ScrollAxis;
  margins: Margins;
};
export class ScrollSession {
  images: ScrollImage[];
  cuts = [0];
  seams: Seam[] = [{ overlap: 0, confidence: 1, warning: "", automatic: true }];
  axis: ScrollAxis = "vertical";
  margins: Margins = { ...NO_MARGINS };
  paused = false;
  warning = "";
  private undoState: Snapshot | undefined;
  private candidate: ScrollImage | undefined;
  private worker: ScrollWorker;
  private generation = 0;
  private busy = false;
  private entry: string | URL;
  constructor(first: ScrollImage, entry: string | URL) {
    this.entry = entry;
    this.images = [first];
    this.worker = new ScrollWorker(entry);
    movingSize(first.getSize(), this.margins);
    this.budget();
  }
  private retained(extra: ScrollImage[] = []): ScrollImage[] {
    return [
      ...new Set([
        ...this.images,
        ...(this.undoState?.images ?? []),
        ...(this.candidate ? [this.candidate] : []),
        ...extra,
      ]),
    ];
  }
  checkAcquisition(
    sources: { width: number; height: number }[],
    selected: { width: number; height: number },
    encodedBytes?: number,
  ): void {
    scrollAcquisitionBudget(
      this.budget(),
      sources,
      selected,
      this.images[0]?.getSize() ?? selected,
      encodedBytes,
    );
  }
  checkPublication(encodedBytes: number): number {
    return scrollPublicationBudget(
      this.retained().map((i) => i.getSize()),
      this.dimensions(),
      encodedBytes,
    );
  }
  budget(): number {
    return scrollBudget(
      this.retained().map((i) => i.getSize()),
      this.dimensions(),
    );
  }
  dimensions() {
    return scrollDimensions(
      this.images.map((i) => movingSize(i.getSize(), this.margins)),
      this.cuts,
      this.axis,
    );
  }
  state() {
    return {
      axis: this.axis,
      margins: this.margins,
      seams: this.seams,
      cuts: this.cuts,
      canUndo: !!this.undoState,
      paused: this.paused,
      warning: this.warning,
      dimensions: this.dimensions(),
      bytes: this.budget(),
      busy: this.busy,
    };
  }
  stop(message = "Rolagem pausada; trechos preservados."): void {
    this.generation++;
    this.worker.cancel();
    this.worker = new ScrollWorker(this.entry);
    this.paused = true;
    this.warning = message;
    this.candidate = undefined;
  }
  dispose(): void {
    this.generation++;
    this.worker.cancel();
    this.candidate = undefined;
  }
  resume(): void {
    this.paused = false;
    this.warning = "";
    this.candidate = undefined;
  }
  private snapshot(): Snapshot {
    return {
      images: [...this.images],
      cuts: [...this.cuts],
      seams: this.seams.map((s) => ({ ...s })),
      axis: this.axis,
      margins: { ...this.margins },
    };
  }
  private restore(state: Snapshot): void {
    this.images = state.images;
    this.cuts = state.cuts;
    this.seams = state.seams;
    this.axis = state.axis;
    this.margins = state.margins;
  }
  private async work(
    op: "analyze" | "preview" | "review" | "stitch",
    images = this.images,
    cuts = this.cuts,
  ): Promise<ScrollReply> {
    const generation = this.generation;
    const result = await this.worker.run(
      op,
      images,
      cuts,
      this.axis,
      this.margins,
      this.retained(images),
    );
    if (generation !== this.generation) throw new Error("Resposta de sessão cancelada.");
    return result;
  }
  async add(
    image: ScrollImage,
    automatic: boolean,
    manual: number | null,
  ): Promise<"added" | "waiting" | "stable" | "ambiguous"> {
    if (this.busy) throw new Error("Aguarde o processamento.");
    if (this.paused && automatic) return "waiting";
    if (this.images.length >= 30) {
      this.stop("Limite de 30 trechos atingido.");
      throw new Error(this.warning);
    }
    const size = movingSize(image.getSize(), this.margins),
      extent = this.axis === "vertical" ? size.height : size.width;
    if (manual !== null && (!Number.isInteger(manual) || manual < 0 || manual >= extent))
      throw new Error("Sobreposição inválida.");
    this.busy = true;
    try {
      const last = this.images.at(-1);
      if (!last) throw new Error("Trecho ausente.");
      if (automatic) {
        if (!this.candidate) {
          scrollBudget(
            this.retained([image]).map((i) => i.getSize()),
            this.dimensions(),
          );
          this.candidate = image;
          return "waiting";
        }
        const stable = await this.work("analyze", [this.candidate, image], [0, 0]);
        this.candidate = image;
        if ((stable.difference ?? Infinity) > 3) return "waiting";
      }
      const result = await this.work("analyze", [last, image], [0, 0]);
      const seam = result.seams?.[1];
      if (!seam) throw new Error("Emenda ausente.");
      if (seam.overlap === extent) {
        this.warning = "Tela estável/sem avanço; confira o fim do conteúdo.";
        return "stable";
      }
      if (!seam.automatic && automatic) {
        this.stop(seam.warning);
        return "ambiguous";
      }
      const cut = manual ?? seam.overlap;
      const nextImages = [...this.images, image],
        nextCuts = [...this.cuts, cut];
      const dimensions = scrollDimensions(
        nextImages.map((i) => movingSize(i.getSize(), this.margins)),
        nextCuts,
        this.axis,
      );
      scrollBudget(
        this.retained([image]).map((i) => i.getSize()),
        dimensions,
      );
      this.undoState = this.snapshot();
      this.images = nextImages;
      this.cuts = nextCuts;
      this.seams = [
        ...this.seams,
        {
          ...seam,
          overlap: cut,
          automatic: manual === null && seam.automatic,
          warning: manual !== null ? "Corte manual: confira a emenda na prévia." : seam.warning,
        },
      ];
      this.warning =
        this.seams.at(-1)?.warning || "Foto capturada. Pode rolar para o próximo trecho.";
      return "added";
    } finally {
      this.busy = false;
    }
  }
  async edit(input: unknown): Promise<ScrollReply> {
    const edit = scrollEditSchema.parse(input);
    if (this.busy) throw new Error("Aguarde o processamento.");
    this.busy = true;
    const before = this.snapshot(),
      oldUndo = this.undoState;
    try {
      if (edit.op === "configure") {
        this.axis = edit.axis;
        this.margins = edit.margins;
        this.cuts = this.images.map(() => 0);
        this.candidate = undefined;
      }
      if (edit.op === "remove") {
        if (this.images.length < 2 || edit.index >= this.images.length)
          throw new Error("Mantenha pelo menos um trecho.");
        this.images = this.images.filter((_, i) => i !== edit.index);
        this.cuts = this.images.map(() => 0);
        this.candidate = undefined;
      }
      if (edit.op === "cut") {
        if (edit.index >= this.cuts.length) throw new Error("Emenda ausente.");
        this.cuts = this.cuts.map((v, i) => (i === edit.index ? edit.overlap : v));
        this.seams = this.seams.map((s, i) =>
          i === edit.index
            ? {
                overlap: edit.overlap,
                confidence: 0,
                automatic: false,
                warning: "Corte manual: revise os pixels.",
              }
            : s,
        );
      }
      if (edit.op === "undo") {
        if (!oldUndo) throw new Error("Nada para desfazer.");
        this.restore(oldUndo);
        this.undoState = undefined;
      } else if (edit.op !== "preview") this.undoState = before;
      this.budget();
      const result = await this.work(
        edit.op === "configure" || edit.op === "remove" ? "review" : "preview",
      );
      if (edit.op === "configure" || edit.op === "remove") {
        if (!result.cuts || !result.seams) throw new Error("Revisão incompleta.");
        this.cuts = result.cuts;
        this.seams = result.seams;
      }
      this.warning = this.seams.some((s) => !!s.warning)
        ? "Revise as emendas sinalizadas antes de salvar."
        : "Prévia atualizada.";
      return result;
    } catch (error) {
      this.restore(before);
      this.undoState = oldUndo;
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async stitch(): Promise<ScrollReply> {
    if (this.busy) throw new Error("Aguarde o processamento.");
    this.busy = true;
    try {
      return await this.work("stitch");
    } finally {
      this.busy = false;
    }
  }
}
