import { z } from "zod";
import { diffProjects } from "./projectDiff.ts";
import type { Project } from "./types.ts";

/**
 * The assistant panel's conversation as it is kept per lesson (main/conversations.ts), what each
 * turn changed in the lesson (turnChanges, from the review's diffProjects) and the recap that
 * goes with the first message after the app opens again.
 */

/** Largest conversation kept, as JSON text. */
export const CHAT_LIMIT = 4_000_000;
/** Changes listed per turn. */
export const TURN_CHANGES = 40;

const usage = z.object({
  tokens: z.number().nonnegative(),
  usd: z.number().nonnegative().optional(),
  estimated: z.boolean().optional(),
});

const change = z.object({
  id: z.string().max(200),
  kind: z.string().max(40),
  label: z.string().max(1000),
  at: z.number().min(0).optional(),
});

export const chatItemSchema = z.object({
  id: z.number(),
  role: z.enum(["user", "assistant", "error"]),
  text: z.string().max(400_000),
  tools: z
    .array(
      z.object({
        id: z.string().max(200),
        name: z.string().max(200).optional(),
        title: z.string().max(500),
        status: z.enum(["running", "done", "error"]),
        summary: z.string().max(2000).optional(),
      }),
    )
    .max(500),
  usage: usage.optional(),
  /** What the turn changed in the lesson. */
  changes: z
    .array(change)
    .max(TURN_CHANGES + 1)
    .optional(),
  /** The undo history's turn (shared/history.ts AiTurn.id), while it can still be undone. */
  turn: z.string().max(100).optional(),
});

export const chatSchema = z.object({
  version: z.literal(1),
  items: z.array(chatItemSchema).max(5000),
  total: usage.optional(),
});

export type SavedChatItem = z.infer<typeof chatItemSchema>;
export type SavedChat = z.infer<typeof chatSchema>;
export type TurnChange = z.infer<typeof change>;

/**
 * What a turn of the assistant changed, from the lesson before it to the lesson after it, as
 * the review bar reads changes ("Balão "Olha aqui!" em 0:04"), at most TURN_CHANGES of them and
 * a last line with how many more.
 */
export function turnChanges(before: Project, after: Project): TurnChange[] {
  if (before === after) return [];
  const items = diffProjects(before, after);
  const out: TurnChange[] = items.slice(0, TURN_CHANGES).map((i) => ({
    id: i.id,
    kind: i.kind,
    label: i.label,
    ...(i.at !== undefined ? { at: i.at } : {}),
  }));
  if (items.length > TURN_CHANGES)
    out.push({
      id: "more",
      kind: "more",
      label: `e mais ${items.length - TURN_CHANGES} ${items.length - TURN_CHANGES === 1 ? "mudança" : "mudanças"}`,
    });
  return out;
}

/**
 * The conversation so far in a few lines, newest last, for the first message after the app
 * opened again (the engine does not remember it): what was asked and what was answered.
 */
export function chatRecap(items: readonly SavedChatItem[], max = 6000): string {
  const lines: string[] = [];
  for (const it of items) {
    if (it.role === "error") continue;
    const text = it.text.replace(/\s+/g, " ").trim();
    const tools = it.tools.map((t) => t.title).filter(Boolean);
    if (it.role === "user") lines.push(`Pessoa: ${text.slice(0, 600)}`);
    else if (text || tools.length)
      lines.push(
        `Assistente${tools.length ? ` (usou ${[...new Set(tools)].join(", ")})` : ""}: ${text.slice(0, 600)}`,
      );
  }
  let out = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = `${lines[i]}\n${out}`;
    if (next.length > max) break;
    out = next;
  }
  return out.trim();
}
