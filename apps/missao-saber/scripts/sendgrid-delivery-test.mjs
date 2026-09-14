import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

const recipient = process.env.MISSAO_EMAIL_TEST_RECIPIENT;
if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient))
  throw new Error("Set MISSAO_EMAIL_TEST_RECIPIENT to an authorized test inbox");
const publicDatabaseUrl = process.env.DATABASE_PUBLIC_URL;
if (!publicDatabaseUrl) throw new Error("Run with the Railway Postgres public variables");
process.env.DATABASE_URL = publicDatabaseUrl;
const root = resolve(import.meta.dirname, "../../..");
const shared = parse(readFileSync(resolve(root, "apps/cozya/.env.local")));
if (!shared.SENDGRID_API_KEY?.startsWith("SG.")) throw new Error("Shared SendGrid key is missing");

const [{ db, eq, and, gte, inArray }, { emailDeliveries }, { createEmailService }] =
  await Promise.all([
    import("@informach/db"),
    import("@informach/db/schema"),
    import("@informach/emails"),
  ]);
const emails = createEmailService({
  apiKey: shared.SENDGRID_API_KEY,
  defaultFrom: "Missão Saber <contato@casaldevgames.com>",
  db,
  mode: "live",
});
const runId = randomUUID();
const runMarker = runId.slice(0, 8);
const startedAt = new Date();
const categories = [
  ["auth.verify-email-otp", "123456"],
  ["auth.sign-in-otp", "234567"],
  ["auth.forget-password-otp", "345678"],
];

for (const [category, otp] of categories) {
  const purpose =
    category === "auth.verify-email-otp"
      ? "confirmar o e-mail"
      : category === "auth.sign-in-otp"
        ? "entrar com segurança"
        : "recuperar o acesso";
  const subject = `Código do Missão Saber para ${purpose} [homologação ${runMarker}]`;
  const text = `Teste operacional autorizado do Missão Saber. O código ${otp} serve para ${purpose} e expira em 10 minutos.`;
  const result = await emails.sendEmail({
    to: recipient,
    subject,
    text,
    html: `<p>Teste operacional autorizado do Missão Saber.</p><p>O código <strong>${otp}</strong> serve para ${purpose} e expira em 10 minutos.</p>`,
    category,
    messageKey: `missao-provider-${runId}-${category}`,
    unsubscribeUrl: "https://missao-saber.informach.com.br/privacidade",
  });
  if (!result.ok) throw new Error(`SendGrid did not accept ${category}: ${result.status}`);
}

const deadline = Date.now() + 60000;
let rows = [];
do {
  rows = await db
    .select({
      category: emailDeliveries.category,
      status: emailDeliveries.status,
      providerAccepted: emailDeliveries.providerAccepted,
      providerMessageId: emailDeliveries.providerMessageId,
      lastError: emailDeliveries.lastError,
    })
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.recipient, recipient),
        gte(emailDeliveries.createdAt, startedAt),
        inArray(
          emailDeliveries.category,
          categories.map(([category]) => category),
        ),
      ),
    );
  if (
    rows.length === categories.length &&
    rows.every((row) => row.providerAccepted && row.providerMessageId && !row.lastError)
  )
    break;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
} while (Date.now() < deadline);

if (
  rows.length !== categories.length ||
  rows.some((row) => !row.providerAccepted || !row.providerMessageId || row.lastError)
)
  throw new Error("Email provider acceptance evidence is incomplete");

const activityQuery = encodeURIComponent(`to_email="${recipient}"`);
let activity = [];
do {
  const response = await fetch(
    `https://api.sendgrid.com/v3/messages?limit=50&query=${activityQuery}`,
    { headers: { authorization: `Bearer ${shared.SENDGRID_API_KEY}` } },
  );
  if (!response.ok) throw new Error(`SendGrid Activity API returned HTTP ${response.status}`);
  const body = await response.json();
  activity = (body.messages ?? []).filter((message) => message.subject?.includes(runMarker));
  if (
    activity.length === categories.length &&
    activity.every((message) => message.status === "delivered")
  )
    break;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
} while (Date.now() < deadline);

if (
  activity.length !== categories.length ||
  activity.some((message) => message.status !== "delivered")
)
  throw new Error("SendGrid delivery evidence is incomplete");

const result = {
  runId,
  categories: rows.map((row) => ({
    category: row.category,
    ledgerStatus: row.status,
    providerAccepted: row.providerAccepted,
    providerMessageId: row.providerMessageId ? "recorded" : "missing",
    error: row.lastError,
  })),
  activityStatuses: activity.map((message) => message.status),
};
process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
