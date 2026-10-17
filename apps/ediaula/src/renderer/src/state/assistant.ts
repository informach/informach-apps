import type { AssistantEvent } from "@shared/types";
import { create } from "zustand";
import { useProject } from "./project";

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
}

interface Conversation {
  items: ChatItem[];
  busy: boolean;
  quota?: { level: "ok" | "warn" | "blocked"; text: string };
}

interface AssistantStore {
  conversations: Record<string, Conversation>;
  send(conversationId: string, text: string): Promise<void>;
  stop(conversationId: string): void;
  reset(conversationId: string): void;
}

let nextId = 1;
const empty: Conversation = { items: [], busy: false };

export const useAssistant = create<AssistantStore>((set, get) => {
  const update = (id: string, fn: (c: Conversation) => Conversation): void => {
    set({ conversations: { ...get().conversations, [id]: fn(get().conversations[id] ?? empty) } });
  };

  /** The assistant item that receives streamed text and tool activity for this turn. */
  const lastAssistant = (c: Conversation): Conversation => {
    const last = c.items[c.items.length - 1];
    if (last?.role === "assistant") return c;
    return { ...c, items: [...c.items, { id: nextId++, role: "assistant", text: "", tools: [] }] };
  };

  window.api.onAssistantEvent((id: string, e: AssistantEvent) => {
    if (e.type === "done") {
      const c = useAssistant.getState().conversations[id];
      if (c?.busy) useProject.getState().endGroup();
    }
    update(id, (c0) => {
      if (e.type === "quota") return { ...c0, quota: { level: e.level, text: e.text } };
      if (e.type === "done") return { ...c0, busy: false };
      if (e.type === "error")
        return {
          ...c0,
          items: [...c0.items, { id: nextId++, role: "error", text: e.message, tools: [] }],
        };
      const c = lastAssistant(c0);
      const items = [...c.items];
      const cur = { ...items[items.length - 1] };
      if (e.type === "text") {
        cur.text += e.delta;
      } else {
        const existing = cur.tools.findIndex((t) => t.id === e.id);
        const prev = existing >= 0 ? cur.tools[existing] : undefined;
        const activity: ToolActivity = {
          id: e.id,
          title: e.title || prev?.title || "Ferramenta",
          status: e.status,
          summary: e.summary ?? prev?.summary,
        };
        cur.tools =
          existing >= 0
            ? cur.tools.map((t, i) => (i === existing ? activity : t))
            : [...cur.tools, activity];
        // Separate what Claude says before and after tool calls.
        if (e.status === "running" && cur.text && !cur.text.endsWith("\n\n")) cur.text += "\n\n";
      }
      items[items.length - 1] = cur;
      return { ...c, items };
    });
  });

  return {
    conversations: {},
    send: async (id, text) => {
      // Everything the assistant changes in this turn becomes a single undo step.
      useProject.getState().beginGroup();
      update(id, (c) => ({
        ...c,
        busy: true,
        items: [...c.items, { id: nextId++, role: "user", text, tools: [] }],
      }));
      await window.api.assistantSend(id, text);
    },
    stop: (id) => void window.api.assistantStop(id),
    reset: (id) => {
      void window.api.assistantReset(id);
      update(id, () => empty);
    },
  };
});
