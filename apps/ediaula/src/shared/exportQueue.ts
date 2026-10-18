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
  private held = false;
  private run: (
    item: ExportItem,
    signal: AbortSignal,
    status: (state: "preparing" | "exporting", message: string) => void,
  ) => Promise<void>;
  private changed: (items: ExportItem[]) => void;
  private persist?: (pending: ExportItem[]) => void;
  private persisted = "";

  /**
   * `persist` receives the items still to export whenever that list changes (an item added,
   * finished or removed; not on every message), so the queue can survive the app.
   */
  constructor(
    run: (
      item: ExportItem,
      signal: AbortSignal,
      status: (state: "preparing" | "exporting", message: string) => void,
    ) => Promise<void>,
    changed: (items: ExportItem[]) => void,
    persist?: (pending: ExportItem[]) => void,
  ) {
    this.run = run;
    this.changed = changed;
    this.persist = persist;
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

  /**
   * While a take records, the next export waits (the one already running goes on, at low
   * priority); releasing the hold starts it.
   */
  hold(on: boolean): void {
    if (this.held === on) return;
    this.held = on;
    this.emit();
    if (!on) void this.pump();
  }

  get holding(): boolean {
    return this.held;
  }

  remove(id: string): void {
    this.items = this.items.filter(
      (i) => i.id !== id || ["preparing", "exporting"].includes(i.state),
    );
    this.emit();
  }

  private emit(): void {
    this.changed([...this.items]);
    if (!this.persist) return;
    const pending = this.items.filter((i) =>
      ["waiting", "preparing", "exporting"].includes(i.state),
    );
    // Kept as waiting whatever their state now: only joining or leaving the list changes it.
    const key = pending.map((i) => i.id).join("|");
    if (key === this.persisted) return;
    this.persisted = key;
    this.persist(pending);
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
        if (!item || this.held) break;
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
