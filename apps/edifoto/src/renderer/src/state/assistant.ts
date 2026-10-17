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
    if (id !== get().conversationId) return;
    if (e.type === "done") {
      const ds = useDoc.getState(),
        entry = ds.past.at(-1);
      const historyId = ds.group && entry?.key === ds.group.key ? entry?.id : undefined;
      if (get().busy) ds.endGroup();
      const items = [...get().items],
        last = items.at(-1);
      if (last?.role === "assistant")
        items[items.length - 1] = {
          ...last,
          documentId: ds.doc?.id,
          historyId,
          layerId: ds.activeId ?? undefined,
        };
      set({ busy: false, items });
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
    items: [],
    busy: false,
    send: async (text) => {
      // Everything the assistant changes in this turn becomes a single undo step.
      useDoc
        .getState()
        .beginGroup(`Assistente: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`);
      set({ busy: true, items: [...get().items, { id: nextId++, role: "user", text, tools: [] }] });
      try {
        await window.api.assistantSend(get().conversationId, text);
      } catch (error) {
        useDoc.getState().endGroup();
        set({
          busy: false,
          items: [
            ...get().items,
            { id: nextId++, role: "error", text: (error as Error).message, tools: [] },
          ],
        });
      }
    },
    stop: () => void window.api.assistantStop(get().conversationId),
    reset: () => {
      if (get().busy) useDoc.getState().endGroup();
      void window.api.assistantReset(get().conversationId);
      set({ conversationId: newConversation(), items: [], busy: false, quota: undefined });
    },
  };
});
