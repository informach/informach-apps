import { join } from "node:path";
import { app } from "electron";
import { createMemoryStore } from "./aiMemory.ts";

/**
 * The chat's memory, in EdiAula's own profile (userData/ai-memory): the folder the memory tools
 * write and the one every turn of the chat reads (engines.ts, assistant.ts).
 */
export const memory = createMemoryStore(() => join(app.getPath("userData"), "ai-memory"));
