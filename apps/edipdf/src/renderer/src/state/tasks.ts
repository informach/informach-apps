import { type LocalTaskRequest, taskDisplayName } from "@shared/task-format";
import { create } from "zustand";

export interface ActiveLocalTask {
  id: string;
  name: string;
  kind: LocalTaskRequest["kind"];
  phase: "queued" | "processing" | "review";
  message: string;
  cancel(): void;
}
interface LocalTasksState {
  active: Record<string, ActiveLocalTask>;
  add(request: LocalTaskRequest, cancel: () => void): void;
  update(id: string, phase: ActiveLocalTask["phase"], message: string): void;
  remove(id: string): void;
}
/** Ephemeral controls only. Prepared document content stays in the protected main-process store. */
export const useLocalTasks = create<LocalTasksState>((set) => ({
  active: {},
  add: (request, cancel) =>
    set((state) => ({
      active: {
        ...state.active,
        [request.id]: {
          id: request.id,
          name: taskDisplayName(request),
          kind: request.kind,
          phase: "queued",
          message: "Aguardando a fila local…",
          cancel,
        },
      },
    })),
  update: (id, phase, message) =>
    set((state) => {
      const task = state.active[id];
      return task ? { active: { ...state.active, [id]: { ...task, phase, message } } } : state;
    }),
  remove: (id) =>
    set((state) => {
      if (!Object.hasOwn(state.active, id)) return state;
      const active = { ...state.active };
      delete active[id];
      return { active };
    }),
}));
