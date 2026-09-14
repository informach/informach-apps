import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const recipient = process.env.MISSAO_EMAIL_TEST_RECIPIENT;
if (!recipient) throw new Error("Set MISSAO_EMAIL_TEST_RECIPIENT");
const root = resolve(import.meta.dirname, "../../..");
const key = parse(readFileSync(resolve(root, "apps/cozya/.env.local"))).SENDGRID_API_KEY;
if (!key?.startsWith("SG.")) throw new Error("Shared SendGrid key is missing");
const query = encodeURIComponent(`to_email="${recipient}"`);
const response = await fetch(`https://api.sendgrid.com/v3/messages?limit=20&query=${query}`, {
  headers: { authorization: `Bearer ${key}` },
});
const body = await response.json();
console.log(
  JSON.stringify({
    http: response.status,
    statuses: (body.messages ?? [])
      .filter((message) => message.subject?.startsWith("Código do Missão Saber"))
      .map((message) => message.status),
    error: body.errors?.[0]?.message ?? null,
  }),
);
