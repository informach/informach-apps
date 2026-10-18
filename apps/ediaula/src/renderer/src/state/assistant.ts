import { type SavedChat, type TurnChange, turnChangesFrom } from "@shared/assistantChat";
import type { AssistantEvent } from "@shared/types";
import { create } from "zustand";
import { useApp } from "./app";
import { useProject } from "./project";

export interface ToolActivity {
  id: string;
  /** The tool's name as the engine called it (mcp__ediaula__get_frame for Claude Code). */
  name?: string;
  title: string;
  status: "running" | "done" | "error";
  summary?: string;
  /** What the tool is doing now, when it says (a step, and how far). */
  progress?: { step: string; ratio?: number };
}

/** What a turn used (shared/aiModels.ts usageLabel shows it). */
export interface TurnUsage {
  tokens: number;
  usd?: number;
  estimated?: boolean;
}

export interface ChatItem {
  id: number;
  role: "user" | "assistant" | "error";
  text: string;
  tools: ToolActivity[];
  usage?: TurnUsage;
  /** What the turn changed in the lesson (on the assistant's answer to it). */
  changes?: TurnChange[];
  /** The undo history's turn, while "Desfazer este pedido" can take it back. */
  turn?: string;
}

interface Conversation {
  items: ChatItem[];
  busy: boolean;
  quota?: { level: "ok" | "warn" | "blocked"; text: string };
  /** Everything the conversation used so far. */
  total?: TurnUsage;
  /** The kept conversation of the lesson was read (or there was none). */
  loaded?: boolean;
}

interface AssistantStore {
  conversations: Record<string, Conversation>;
  send(conversationId: string, text: string): Promise<void>;
  stop(conversationId: string): void;
  reset(conversationId: string): void;
  /** Reads the conversation kept for the lesson, once. */
  load(conversationId: string): Promise<void>;
  /** "Desfazer este pedido": the turn's edits, while nothing was done after them. */
  undoTurn(conversationId: string, itemId: number): void;
  /** A tool of the editor says how it is going (also from the main process). */
  progress(conversationId: string, name: string, step: string, ratio?: number): void;
}

let nextId = 1;
const empty: Conversation = { items: [], busy: false };

const add = (a: TurnUsage | undefined, b: TurnUsage): TurnUsage => ({
  tokens: (a?.tokens ?? 0) + b.tokens,
  ...((a === undefined || a.usd !== undefined) && b.usd !== undefined
    ? { usd: (a?.usd ?? 0) + b.usd }
    : {}),
  ...(a?.estimated || b.estimated ? { estimated: true } : {}),
});

const bare = (name: string | undefined): string =>
  (name ?? "").replace(/^mcp__ediaula__/, "").replace(/^ediaula[./]/, "");

/** The conversation as it is kept: what is still running is kept as stopped. */
function savedOf(c: Conversation): SavedChat {
  return {
    version: 1,
    items: c.items.map((it) => ({
      id: it.id,
      role: it.role,
      text: it.text,
      tools: it.tools.map((t) => ({
        id: t.id,
        ...(t.name ? { name: t.name } : {}),
        title: t.title,
        status: t.status === "running" ? "error" : t.status,
        ...(t.summary ? { summary: t.summary } : {}),
      })),
      ...(it.usage ? { usage: it.usage } : {}),
      ...(it.changes?.length ? { changes: it.changes } : {}),
    })),
    ...(c.total ? { total: c.total } : {}),
  };
}

const saving = new Map<string, ReturnType<typeof setTimeout>>();

export const useAssistant = create<AssistantStore>((set, get) => {
  const update = (id: string, fn: (c: Conversation) => Conversation): void => {
    set({ conversations: { ...get().conversations, [id]: fn(get().conversations[id] ?? empty) } });
  };

  /** Keeps the conversation of the lesson a moment after it changes (not while it streams). */
  const keep = (id: string): void => {
    clearTimeout(saving.get(id));
    saving.set(
      id,
      setTimeout(() => {
        saving.delete(id);
        const c = get().conversations[id];
        if (!c?.loaded || c.busy) return;
        window.api.assistantSaveChat(id, savedOf(c)).catch((err: unknown) => {
          // The chat goes on; only the copy for the next session is missing.
          console.error("[ediaula] chat_not_kept", err instanceof Error ? err.message : err);
        });
      }, 600),
    );
  };

  /** The assistant item that receives streamed text and tool activity for this turn. */
  const lastAssistant = (c: Conversation): Conversation => {
    const last = c.items[c.items.length - 1];
    if (last?.role === "assistant") return c;
    return { ...c, items: [...c.items, { id: nextId++, role: "assistant", text: "", tools: [] }] };
  };

  const setProgress = (
    c0: Conversation,
    name: string,
    step: string,
    ratio?: number,
  ): Conversation => {
    const c = lastAssistant(c0);
    const items = [...c.items];
    const cur = { ...items[items.length - 1] };
    const at = [...cur.tools]
      .reverse()
      .findIndex((t) => t.status === "running" && bare(t.name) === bare(name));
    if (at < 0) return c0;
    const index = cur.tools.length - 1 - at;
    cur.tools = cur.tools.map((t, i) =>
      i === index ? { ...t, progress: { step, ...(ratio !== undefined ? { ratio } : {}) } } : t,
    );
    items[items.length - 1] = cur;
    return { ...c, items };
  };

  window.api.onAssistantEvent((id: string, e: AssistantEvent) => {
    update(id, (c0) => {
      if (e.type === "quota") return { ...c0, quota: { level: e.level, text: e.text } };
      if (e.type === "done") return { ...c0, busy: false };
      if (e.type === "progress") return setProgress(c0, e.name, e.step, e.ratio);
      if (e.type === "error")
        return {
          ...c0,
          items: [...c0.items, { id: nextId++, role: "error", text: e.message, tools: [] }],
        };
      const c = lastAssistant(c0);
      const items = [...c.items];
      const cur = { ...items[items.length - 1] };
      if (e.type === "usage") {
        const usage: TurnUsage = {
          tokens: e.tokens,
          ...(e.usd !== undefined ? { usd: e.usd } : {}),
          ...(e.estimated ? { estimated: true } : {}),
        };
        cur.usage = add(cur.usage, usage);
        items[items.length - 1] = cur;
        return { ...c, items, total: add(c.total, usage) };
      }
      if (e.type === "text") {
        cur.text += e.delta;
      } else {
        const existing = cur.tools.findIndex((t) => t.id === e.id);
        const prev = existing >= 0 ? cur.tools[existing] : undefined;
        const activity: ToolActivity = {
          id: e.id,
          ...(e.name || prev?.name ? { name: e.name || prev?.name } : {}),
          title: e.title || prev?.title || "Ferramenta",
          status: e.status,
          summary: e.summary ?? prev?.summary,
          // The step stays only while it runs.
          ...(e.status === "running" && prev?.progress ? { progress: prev.progress } : {}),
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
    if (e.type === "done") keep(id);
  });

  return {
    conversations: {},
    load: async (id) => {
      if (get().conversations[id]?.loaded) return;
      let saved: SavedChat | null = null;
      try {
        saved = await window.api.assistantLoadChat(id);
      } catch (err) {
        console.error("[ediaula] chat_not_read", err instanceof Error ? err.message : err);
      }
      update(id, (c) => {
        if (c.loaded) return c;
        // What happened while it loaded (a message sent right away) goes after what was kept.
        const kept: ChatItem[] = (saved?.items ?? []).map((it) => ({
          ...it,
          id: nextId++,
          tools: it.tools.map((t) => ({ ...t })),
        }));
        return {
          ...c,
          loaded: true,
          items: [...kept, ...c.items],
          ...(saved?.total || c.total
            ? {
                total:
                  saved?.total && c.total ? add(saved.total, c.total) : (c.total ?? saved?.total),
              }
            : {}),
        };
      });
    },
    send: async (id, text) => {
      // Everything the assistant changes in this turn is undone by one Ctrl+Z, in this project only.
      const turn = useProject.getState().beginAiTurn(id);
      update(id, (c) => ({
        ...c,
        busy: true,
        items: [...c.items, { id: nextId++, role: "user", text, tools: [] }],
      }));
      try {
        await window.api.assistantSend(id, text);
      } catch (err) {
        update(id, (c) => ({
          ...c,
          busy: false,
          items: [
            ...c.items,
            {
              id: nextId++,
              role: "error",
              text: `Não foi possível enviar: ${err instanceof Error ? err.message : String(err)}`,
              tools: [],
            },
          ],
        }));
      } finally {
        useProject.getState().endAiTurn(turn);
        // What the turn changed, on its answer: only the steps of the history the turn made.
        const state = useProject.getState();
        if (turn && state.project?.id === id) {
          const changes = turnChangesFrom(state, state.project, turn.id);
          if (changes.length)
            update(id, (c) => {
              const items = [...c.items];
              for (let i = items.length - 1; i >= 0; i--) {
                if (items[i].role === "user") break;
                if (items[i].role !== "assistant") continue;
                items[i] = { ...items[i], changes, turn: turn.id };
                break;
              }
              return { ...c, items };
            });
        }
        keep(id);
      }
    },
    stop: (id) => void window.api.assistantStop(id),
    reset: (id) => {
      clearTimeout(saving.get(id));
      void window.api.assistantReset(id);
      update(id, () => ({ ...empty, loaded: true }));
    },
    undoTurn: (id, itemId) => {
      const item = get().conversations[id]?.items.find((i) => i.id === itemId);
      const { toast } = useApp.getState();
      if (!item?.turn) return;
      const project = useProject.getState();
      if (project.project?.id !== id) return;
      const total = project.pastMeta.filter((e) => e.turn === item.turn).length;
      const done = project.undoAi((e) => e.turn === item.turn, 1000);
      if (!done) {
        toast(
          "Depois deste pedido houve outra edição. Desfaça com Ctrl+Z, um passo de cada vez.",
          "info",
        );
        return;
      }
      update(id, (c) => ({
        ...c,
        items: c.items.map((i) => (i.id === itemId ? { ...i, turn: undefined } : i)),
      }));
      toast(
        done < total
          ? `Desfiz ${done} de ${total} edições deste pedido; as outras vêm antes de uma edição sua.`
          : `Pedido desfeito: ${done === 1 ? "1 edição" : `${done} edições`}.`,
        done < total ? "info" : "success",
      );
    },
    progress: (id, name, step, ratio) => update(id, (c) => setProgress(c, name, step, ratio)),
  };
});
