import type { AssistantEvent } from "@shared/types";
import { create } from "zustand";
import { useDoc } from "./doc";

export interface ToolActivity {
  id: string;
  title: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export interface ChatItem {
  id: number;
  role: "user" | "assistant" | "error";
  text: string;
  tools: ToolActivity[];
  documentId?: string;
  historyId?: number;
  layerId?: string;
}

interface AssistantStore {
  conversationId: string;
  runId: string | null;
  documentId: string | null;
  items: ChatItem[];
  busy: boolean;
  quota?: { level: "ok" | "warn" | "blocked"; text: string };
  send(text: string): Promise<void>;
  stop(): void;
  reset(): void;
}

let nextId = 1;
const newConversation = (): string => `c${Date.now().toString(36)}`;

export const useAssistant = create<AssistantStore>((set, get) => {
  /** The assistant item that receives streamed text and tool activity for this turn. */
  const withAssistant = (items: ChatItem[]): ChatItem[] =>
    items[items.length - 1]?.role === "assistant"
      ? items
      : [...items, { id: nextId++, role: "assistant", text: "", tools: [] }];

  window.api.onAssistantEvent((id: string, e: AssistantEvent) => {
    if (id !== get().runId) return;
    if (e.type === "done") {
      const ds = useDoc.getState(),
        entry = ds.past.at(-1);
      const historyId =
        ds.doc?.id === get().documentId && entry?.key === `ai:${get().runId}`
          ? entry.id
          : undefined;
      const items = [...get().items];
      const lastUser = [...items].reverse().find((item) => item.role === "user");
      const lastUserIndex = lastUser ? items.indexOf(lastUser) : -1;
      const target = items
        .slice(lastUserIndex + 1)
        .reverse()
        .find((item) => item.role === "assistant");
      const index = target ? items.indexOf(target) : -1;
      if (index >= 0)
        items[index] = {
          ...items[index],
          documentId: get().documentId ?? undefined,
          historyId,
          layerId: ds.activeId ?? undefined,
        };
      set({ busy: false, items, runId: null });
      return;
    }
    if (e.type === "quota") return set({ quota: { level: e.level, text: e.text } });
    if (e.type === "error") {
      // Engines can report the same failure twice (turn failed + process error).
      const last = get().items[get().items.length - 1];
      if (last?.role === "error" && last.text === e.message) return;
      return set({
        items: [...get().items, { id: nextId++, role: "error", text: e.message, tools: [] }],
      });
    }
    const items = withAssistant(get().items);
    const cur = { ...items[items.length - 1] };
    if (e.type === "text") {
      cur.text += e.delta;
    } else {
      const i = cur.tools.findIndex((t) => t.id === e.id);
      const prev = i >= 0 ? cur.tools[i] : undefined;
      const activity: ToolActivity = {
        id: e.id,
        title: e.title || prev?.title || "Ferramenta",
        status: e.status,
        summary: e.summary ?? prev?.summary,
      };
      cur.tools =
        i >= 0 ? cur.tools.map((t, j) => (j === i ? activity : t)) : [...cur.tools, activity];
      // Separate what the assistant says before and after tool calls.
      if (e.status === "running" && cur.text && !cur.text.endsWith("\n\n")) cur.text += "\n\n";
    }
    set({ items: [...items.slice(0, -1), cur] });
  });

  return {
    conversationId: newConversation(),
    runId: null,
    documentId: null,
    items: [],
    busy: false,
    send: async (text) => {
      const documentId = useDoc.getState().doc?.id;
      if (get().busy || !documentId || !text.trim()) return;
      const runId = crypto.randomUUID();
      if (get().documentId !== documentId)
        set({ conversationId: newConversation(), items: [], documentId, quota: undefined });
      set({
        busy: true,
        runId,
        items: [...get().items, { id: nextId++, role: "user", text, tools: [] }],
      });
      try {
        await window.api.assistantSend(
          get().conversationId,
          text,
          documentId,
          runId,
          useDoc.getState().initialStateId,
        );
      } catch (error) {
        if (get().runId !== runId) return;
        set({
          busy: false,
          runId: null,
          items: [
            ...get().items,
            {
              id: nextId++,
              role: "error",
              text: error instanceof Error ? error.message : String(error),
              tools: [],
            },
          ],
        });
      }
    },
    stop: () => {
      const id = get().runId;
      if (id) void window.api.assistantStop(id);
    },
    reset: () => {
      void window.api.assistantReset(get().conversationId);
      set({
        conversationId: newConversation(),
        runId: null,
        documentId: useDoc.getState().doc?.id ?? null,
        items: [],
        busy: false,
        quota: undefined,
      });
    },
  };
});

useDoc.subscribe((current, previous) => {
  if (current.doc?.id !== previous.doc?.id || current.initialStateId !== previous.initialStateId)
    useAssistant.getState().reset();
});
