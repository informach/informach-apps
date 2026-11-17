/**
 * A notice on the phone when a pipeline run ends, through ntfy (https://ntfy.sh). It is a personal
 * setting of this computer, not a feature of the suite: only with EDISVG_NTFY_TOPIC in the
 * environment does anything leave the computer (EDISVG_NTFY_SERVER points at another ntfy server).
 *
 * The topic works as a password: whoever knows it reads its messages. So the notice carries only
 * whether the run worked, the recipe's name and how long it took, never a file's name or path.
 */

const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_SERVER = "https://ntfy.sh";
const TIMEOUT_MS = 10_000;

export interface PipelineNotice {
  ok: boolean;
  recipe: string;
  seconds: number;
}

export interface NtfyTarget {
  server: string;
  topic: string;
}

/** Where to send, from the environment; null when the notice is off or set wrongly. */
export function ntfyTarget(env: NodeJS.ProcessEnv): NtfyTarget | null {
  const topic = env.EDISVG_NTFY_TOPIC?.trim();
  if (!topic) return null;
  if (!TOPIC.test(topic)) {
    console.warn("[edisvg] EDISVG_NTFY_TOPIC: use só letras, números, - e _ (até 64).");
    return null;
  }
  const raw = env.EDISVG_NTFY_SERVER?.trim() || DEFAULT_SERVER;
  let server: URL;
  try {
    server = new URL(raw);
  } catch {
    console.warn("[edisvg] EDISVG_NTFY_SERVER não é um endereço.");
    return null;
  }
  // The topic is the password: never over plain HTTP, except to a server on this computer.
  const local = server.hostname === "localhost" || server.hostname === "127.0.0.1";
  if (server.protocol !== "https:" && !(server.protocol === "http:" && local)) {
    console.warn("[edisvg] EDISVG_NTFY_SERVER precisa ser https.");
    return null;
  }
  return { server: server.origin, topic };
}

/** What the window sends, checked: it never decides more than these three facts. */
export function parseNotice(value: unknown): PipelineNotice {
  const notice = value as Partial<PipelineNotice> | null;
  if (
    !notice ||
    typeof notice.ok !== "boolean" ||
    typeof notice.recipe !== "string" ||
    typeof notice.seconds !== "number" ||
    !Number.isFinite(notice.seconds) ||
    notice.seconds < 0
  )
    throw new Error("Aviso do pipeline inválido.");
  return { ok: notice.ok, recipe: notice.recipe.slice(0, 120), seconds: notice.seconds };
}

export const duration = (seconds: number): string => {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
};

/** The ntfy JSON message (UTF-8 in the body, so accents survive, unlike in headers). */
export function ntfyMessage(topic: string, notice: PipelineNotice) {
  return {
    topic,
    title: notice.ok ? "EdiSVG: pipeline pronto" : "EdiSVG: o pipeline parou",
    message: `${notice.recipe || "Pipeline"} · ${duration(notice.seconds)}`,
    tags: [notice.ok ? "white_check_mark" : "warning"],
    priority: notice.ok ? 3 : 4,
  };
}

/** Sends the notice when it is on. Never throws: a notice that did not go stops nothing. */
export async function notifyPipelineEnd(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
  send: typeof fetch = fetch,
): Promise<boolean> {
  const target = ntfyTarget(env);
  if (!target) return false;
  try {
    const response = await send(target.server, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ntfyMessage(target.topic, parseNotice(value))),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`ntfy respondeu ${response.status}`);
    return true;
  } catch (error) {
    console.warn("[edisvg] Aviso do pipeline no celular:", error);
    return false;
  }
}
