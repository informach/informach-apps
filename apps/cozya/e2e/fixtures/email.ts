import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type SandboxEmail = {
  id: string;
  to: string;
  from: string;
  subject: string;
  category: string;
  messageKey: string;
  userId?: string;
  text?: string | null;
  html?: string;
};

const DEFAULT_DIR = process.env.EMAIL_SANDBOX_DIR ?? "./tmp/integration_emails";
const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

async function listEmails(dir: string): Promise<SandboxEmail[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const jsonFiles = names.filter((name) => name.endsWith(".json"));
  const emails = await Promise.all(
    jsonFiles.map(async (name) => {
      const id = name.replace(/\.json$/, "");
      const meta = JSON.parse(await readFile(join(dir, name), "utf8")) as Omit<
        SandboxEmail,
        "html"
      >;
      let html: string | undefined;
      try {
        html = await readFile(join(dir, `${id}.html`), "utf8");
      } catch {
        html = undefined;
      }
      return { ...meta, html } satisfies SandboxEmail;
    }),
  );
  return emails;
}

export type WaitForEmailOptions = {
  to: string;
  category: string;
  timeoutMs?: number;
  dir?: string;
};

export async function waitForEmail(opts: WaitForEmailOptions): Promise<SandboxEmail> {
  const dir = opts.dir ?? DEFAULT_DIR;
  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  while (Date.now() < deadline) {
    const all = await listEmails(dir);
    const match = all.find(
      (email) => email.to === opts.to && email.category === opts.category,
    );
    if (match) return match;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    `waitForEmail: no email matching to=${opts.to} category=${opts.category} within ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms (dir=${dir})`,
  );
}

const URL_PATTERN = /https?:\/\/[^\s"<>]+/g;

export function extractFirstUrl(email: SandboxEmail, hint?: string): string {
  const haystack = email.html ?? email.text ?? "";
  const matches = haystack.match(URL_PATTERN) ?? [];
  if (hint) {
    const found = matches.find((url) => url.includes(hint));
    if (found) return found;
  }
  if (matches[0]) return matches[0];
  throw new Error(`extractFirstUrl: no URL found in email ${email.id}`);
}
