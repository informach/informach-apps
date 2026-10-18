import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import {
  CHAT_LIMIT,
  chatRecap,
  chatSchema,
  fitChat,
  maskChat,
  type SavedChat,
} from "../shared/assistantChat.ts";
import { oneAtATime } from "./fileQueue.ts";
import { renameWhenFree } from "./installCheck.ts";

/**
 * The assistant's conversation of each lesson, kept between sessions in
 * userData/conversas/<projeto>: what the panel shows (`chat.json`, written by the editor) and the
 * Claude Code session and Codex thread that go on with it (`motor.json`). The API history is not
 * kept as such: after the app opens again, the first message carries a recap of the panel.
 */

const ID = /^[\w-]{1,100}$/;

const folder = (id: string): string => {
  if (!ID.test(id)) throw new Error("Conversa inválida.");
  return join(app.getPath("userData"), "conversas", id);
};

async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, text, "utf8");
  await renameWhenFree(tmp, path);
}

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    // A damaged file starts the conversation over instead of stopping the panel.
    console.warn(`[ediaula] conversa ilegível em ${path}: ${(err as Error).message}`);
    return null;
  }
}

export async function loadChat(id: string): Promise<SavedChat | null> {
  const raw = await readJson(join(folder(id), "chat.json"));
  if (raw === null) return null;
  const parsed = chatSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Saves the panel's conversation: texts that look like secrets masked (an API key or a token
 * pasted in the chat), and the oldest items dropped until it fits CHAT_LIMIT.
 */
export async function saveChat(id: string, raw: unknown): Promise<void> {
  const text = JSON.stringify(fitChat(maskChat(chatSchema.parse(raw)), CHAT_LIMIT));
  const file = join(folder(id), "chat.json");
  await oneAtATime(file, () => writeAtomic(file, text));
}

const engineSchema = z.object({
  claude: z.string().max(200).optional(),
  codex: z.string().max(200).optional(),
});
export type EngineState = z.infer<typeof engineSchema>;

export async function loadEngineState(id: string): Promise<EngineState> {
  const parsed = engineSchema.safeParse((await readJson(join(folder(id), "motor.json"))) ?? {});
  return parsed.success ? parsed.data : {};
}

/** Saves what changed of the engine state (the other fields stay as they were). */
export async function saveEngineState(id: string, change: EngineState): Promise<void> {
  const file = join(folder(id), "motor.json");
  await oneAtATime(file, async () => {
    const now = await loadEngineState(id);
    await writeAtomic(file, JSON.stringify({ ...now, ...change }));
  });
}

/**
 * "Nova conversa": everything of it goes. EdiAula has no flow that deletes a lesson (only the
 * recent list forgets one), so a lesson deleted outside the app leaves its folder here until
 * "Nova conversa" is used on it.
 */
export async function forgetConversation(id: string): Promise<void> {
  const dir = folder(id);
  await oneAtATime(join(dir, "chat.json"), () =>
    oneAtATime(join(dir, "motor.json"), () => rm(dir, { recursive: true, force: true })),
  );
}

/**
 * The first message of a conversation the app opened again: the engine does not remember it, so
 * it carries a recap of the panel (main/conversations.ts keeps the panel per lesson).
 */
export async function withRecap(conversationId: string, text: string): Promise<string> {
  // Without the recap the turn still goes on, only without the earlier context.
  const saved = await loadChat(conversationId).catch((err: unknown) => {
    console.warn("[ediaula] conversation_recap_failed", err instanceof Error ? err.message : err);
    return null;
  });
  // The panel may have kept this very message already.
  const items = saved?.items ?? [];
  const last = items[items.length - 1];
  const earlier = last?.role === "user" && last.text === text ? items.slice(0, -1) : items;
  const recap = chatRecap(earlier);
  return recap
    ? `Conversa anterior nesta aula (resumo; o projeto pode ter mudado desde então):
${recap}

---

${text}`
    : text;
}
