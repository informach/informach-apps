import type { ExportSpec, Project } from "./types.ts";

export type ExportState = "waiting" | "preparing" | "exporting" | "done" | "error" | "cancelled";
export interface ExportItem {
  id: string;
  project: Project;
  spec: ExportSpec;
  captions: boolean;
  state: ExportState;
  message?: string;
}

/** Serial exports own their snapshots; editing or closing a project cannot change a queued job. */
export class ExportQueue {
  items: ExportItem[] = [];
  private active: AbortController | null = null;
  private working = false;
  private run: (
    item: ExportItem,
    signal: AbortSignal,
    status: (state: "preparing" | "exporting", message: string) => void,
  ) => Promise<void>;
  private changed: (items: ExportItem[]) => void;

  constructor(
    run: (
      item: ExportItem,
      signal: AbortSignal,
      status: (state: "preparing" | "exporting", message: string) => void,
    ) => Promise<void>,
    changed: (items: ExportItem[]) => void,
  ) {
    this.run = run;
    this.changed = changed;
  }

  add(item: Pick<ExportItem, "id" | "project" | "spec" | "captions">): void {
    const path = item.spec.outPath.replaceAll("\\", "/").toLowerCase();
    if (
      this.items.some(
        (i) =>
          ["waiting", "preparing", "exporting"].includes(i.state) &&
          i.spec.outPath.replaceAll("\\", "/").toLowerCase() === path,
      )
    ) {
      throw new Error("Já existe uma exportação na fila para esse arquivo. Escolha outro nome.");
    }
    this.items = [...this.items, { ...structuredClone(item), state: "waiting" }];
    this.emit();
    void this.pump();
  }

  cancel(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.state === "waiting") this.update(id, { state: "cancelled" });
    else if (item.state === "preparing" || item.state === "exporting") this.active?.abort();
  }

  remove(id: string): void {
    this.items = this.items.filter(
      (i) => i.id !== id || ["preparing", "exporting"].includes(i.state),
    );
    this.emit();
  }

  private emit(): void {
    this.changed([...this.items]);
  }
  private update(id: string, change: Partial<ExportItem>): void {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...change } : i));
    this.emit();
  }

  private async pump(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (;;) {
        const item = this.items.find((i) => i.state === "waiting");
        if (!item) break;
        const id = item.id;
        const controller = new AbortController();
        this.active = controller;
        this.update(id, { state: "preparing", message: "Preparando mídias…" });
        try {
          await this.run(structuredClone(item), controller.signal, (state, message) =>
            this.update(id, { state, message }),
          );
          this.update(id, {
            state: controller.signal.aborted ? "cancelled" : "done",
            message: undefined,
          });
        } catch (error) {
          this.update(id, {
            state: controller.signal.aborted ? "cancelled" : "error",
            message: controller.signal.aborted
              ? undefined
              : String(error instanceof Error ? error.message : error),
          });
        } finally {
          this.active = null;
        }
      }
    } finally {
      this.working = false;
    }
  }
}
