import { randomUUID } from "node:crypto";
import type { EditJob } from "../shared/edit.ts";
import type { QueueItem } from "../shared/types.ts";

type Runner = (
  job: EditJob,
  item: QueueItem,
  signal: AbortSignal,
  progress: (ratio: number) => void,
) => Promise<string[]>;

/**
 * Edits run one at a time, in order (the pattern of EdiAula's ExportQueue): each can be cancelled
 * while waiting or working, and two jobs never write the same file.
 */
export class EditQueue {
  private items: QueueItem[] = [];
  private jobs = new Map<string, EditJob>();
  private controllers = new Map<string, AbortController>();
  private running = false;
  private readonly run: Runner;
  private readonly changed: (items: QueueItem[]) => void;

  constructor(run: Runner, changed: (items: QueueItem[]) => void) {
    this.run = run;
    this.changed = changed;
  }

  list(): QueueItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  add(job: EditJob, label: string, outputs: string[], openFolder: boolean): QueueItem {
    const busy = new Set(
      this.items
        .filter((i) => i.status === "waiting" || i.status === "working")
        .flatMap((i) => i.outputs.map((o) => o.toLowerCase())),
    );
    if (outputs.some((o) => busy.has(o.toLowerCase())))
      throw new Error("Já há um salvamento na fila para este arquivo.");
    const item: QueueItem = {
      id: randomUUID(),
      label,
      outputs,
      status: "waiting",
      ratio: 0,
      openFolder,
    };
    this.items.push(item);
    this.jobs.set(item.id, job);
    this.emit();
    void this.next();
    return { ...item };
  }

  cancel(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "waiting") {
      item.status = "cancelled";
      this.jobs.delete(id);
      this.emit();
    } else if (item.status === "working") this.controllers.get(id)?.abort(new Error("Cancelado."));
  }

  cancelAll(): void {
    for (const item of this.items) this.cancel(item.id);
  }

  clearFinished(): void {
    this.items = this.items.filter((i) => i.status === "waiting" || i.status === "working");
    this.emit();
  }

  private emit(): void {
    this.changed(this.list());
  }

  private async next(): Promise<void> {
    if (this.running) return;
    const item = this.items.find((i) => i.status === "waiting");
    const job = item ? this.jobs.get(item.id) : undefined;
    if (!item || !job) return;
    this.running = true;
    const controller = new AbortController();
    this.controllers.set(item.id, controller);
    item.status = "working";
    item.startedAt = Date.now();
    this.emit();
    let last = 0;
    try {
      item.outputs = await this.run(job, item, controller.signal, (ratio) => {
        item.ratio = Math.max(0, Math.min(1, ratio));
        // Progress arrives many times a second; the window needs a few.
        if (Date.now() - last > 250) {
          last = Date.now();
          this.emit();
        }
      });
      item.status = "done";
      item.ratio = 1;
    } catch (error) {
      item.status = controller.signal.aborted ? "cancelled" : "error";
      item.message = controller.signal.aborted
        ? undefined
        : error instanceof Error
          ? error.message
          : String(error);
    } finally {
      this.controllers.delete(item.id);
      this.jobs.delete(item.id);
      this.running = false;
      this.emit();
      void this.next();
    }
  }
}
