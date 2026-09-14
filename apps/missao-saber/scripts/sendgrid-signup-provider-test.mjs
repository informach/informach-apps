import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { parse } from "dotenv";
import Redis from "ioredis";
import postgres from "postgres";

const recipient = process.env.MISSAO_EMAIL_TEST_RECIPIENT;
const databaseUrl = process.env.DATABASE_PUBLIC_URL;
const redisUrl = process.env.REDIS_PUBLIC_URL;
if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient))
  throw new Error("Set MISSAO_EMAIL_TEST_RECIPIENT to an authorized test inbox");
if (!databaseUrl) throw new Error("Run with the Railway Postgres public variables");
if (!redisUrl) throw new Error("Run with the Railway Redis public variables");
const origin = "https://missao-saber.informach.com.br";
const root = resolve(import.meta.dirname, "../../..");
const shared = parse(readFileSync(resolve(root, "apps/cozya/.env.local")));
if (!shared.SENDGRID_API_KEY?.startsWith("SG.")) throw new Error("Shared SendGrid key is missing");

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });
const redis = new Redis(redisUrl, { connectTimeout: 15000, maxRetriesPerRequest: 2 });
const startedAt = new Date();
let createdUserId = "";
let inboxWasFree = false;
let browser;

async function poll(label, operation, predicate, timeout = 90000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await operation();
    if (predicate(latest)) return latest;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
  }
  throw new Error(`${label} did not converge: ${JSON.stringify(latest)}`);
}

async function otpFor(type, requestedAt) {
  const identifier = `${type}-otp-${recipient.toLowerCase()}`;
  const earliest = requestedAt.getTime() - 30_000;
  const verification = await poll(
    `${type} challenge`,
    async () => {
      const raw = await redis.get(`missao-saber:auth:verification:${identifier}`);
      return raw ? JSON.parse(raw) : null;
    },
    (value) =>
      /^\d{6}:\d+$/.test(value?.value ?? "") && new Date(value.createdAt).getTime() >= earliest,
  );
  return verification.value.slice(0, 6);
}

async function delivered(category, requestedAt) {
  const earliest = new Date(requestedAt.getTime() - 30_000);
  const rows = await poll(
    `${category} signed delivery webhook`,
    () => sql`
      select status,
             provider_accepted,
             provider_message_id is not null as has_provider_id,
             last_error
        from core.email_deliveries
       where lower(recipient) = lower(${recipient})
         and category = ${category}
         and created_at >= ${earliest}
       order by created_at desc
       limit 1
    `,
    (values) =>
      values.length === 1 &&
      values[0].status === "delivered" &&
      values[0].provider_accepted === true &&
      values[0].has_provider_id === true &&
      !values[0].last_error,
  );
  return rows[0];
}

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  return { context, page: await context.newPage() };
}

try {
  const existing = await sql`
    select id from core.users where lower(email) = lower(${recipient}) limit 1
  `;
  if (existing.length)
    throw new Error("The authorized inbox already has an account; refusing a destructive test");
  inboxWasFree = true;

  browser = await chromium.launch({ headless: true });
  let { context, page } = await newPage();
  await page.goto(`${origin}/entrar`);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Como podemos chamar o responsável?").fill("Homologação Missão Saber");
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(recipient);
  const originalPassword = `Ms-Test-${randomUUID()}!aA7`;
  await page.getByLabel("Senha", { exact: true }).fill(originalPassword);
  await page.getByRole("checkbox").check();
  const signupRequestedAt = new Date();
  await page.getByRole("button", { name: "Criar conta do responsável" }).click();
  await page.getByLabel("Código de seis dígitos").waitFor({ timeout: 30000 });

  const [created] = await poll(
    "temporary signup account",
    () => sql`
      select id, email_verified
        from core.users
       where lower(email) = lower(${recipient})
       limit 1
    `,
    (rows) => rows.length === 1 && rows[0].email_verified === false,
  );
  createdUserId = created.id;
  await page
    .getByLabel("Código de seis dígitos")
    .fill(await otpFor("email-verification", signupRequestedAt));
  await page.getByRole("button", { name: "Confirmar e-mail", exact: true }).click();
  await page.waitForURL(`${origin}/familia`);
  await poll(
    "verified temporary account",
    () => sql`
      select email_verified from core.users where id = ${createdUserId}
    `,
    (rows) => rows[0]?.email_verified === true,
  );
  const signupDelivery = await delivered("auth.verify-email-otp", signupRequestedAt);
  await context.close();

  ({ context, page } = await newPage());
  await page.goto(`${origin}/entrar`);
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(recipient);
  const signInRequestedAt = new Date();
  await page.getByRole("button", { name: "Entrar com código por e-mail" }).click();
  await page.getByLabel("Código de seis dígitos").waitFor();
  await page.getByLabel("Código de seis dígitos").fill(await otpFor("sign-in", signInRequestedAt));
  await page.getByRole("button", { name: "Entrar no Missão Saber" }).click();
  await page.waitForURL(`${origin}/familia`);
  const signInDelivery = await delivered("auth.sign-in-otp", signInRequestedAt);
  await context.close();

  ({ context, page } = await newPage());
  await page.goto(`${origin}/entrar`);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(recipient);
  const resetRequestedAt = new Date();
  await page.getByRole("button", { name: "Enviar código de recuperação" }).click();
  await page.getByLabel("Nova senha").waitFor();
  const newPassword = `Ms-New-${randomUUID()}!aA8`;
  await page.getByLabel("Nova senha").fill(newPassword);
  await page
    .getByLabel("Código de seis dígitos")
    .fill(await otpFor("forget-password", resetRequestedAt));
  await page.getByRole("button", { name: "Definir nova senha" }).click();
  await page.getByText("Senha atualizada. Entre com sua nova senha.").waitFor();
  const resetDelivery = await delivered("auth.forget-password-otp", resetRequestedAt);
  await page.getByLabel("Senha", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Entrar no Missão Saber" }).click();
  await page.waitForURL(`${origin}/familia`);
  await context.close();

  // The signed Event Webhook is the durable evidence. The Activity API has a
  // separate low quota, so it is only a best-effort cross-check.
  const activityQuery = encodeURIComponent(`to_email="${recipient}"`);
  const activityResponse = await fetch(
    `https://api.sendgrid.com/v3/messages?limit=20&query=${activityQuery}`,
    { headers: { authorization: `Bearer ${shared.SENDGRID_API_KEY}` } },
  );
  let activityStatus = `http_${activityResponse.status}`;
  if (activityResponse.ok) {
    const body = await activityResponse.json();
    activityStatus = (body.messages ?? []).some(
      (message) =>
        message.status === "delivered" &&
        new Date(message.last_event_time).getTime() >= startedAt.getTime(),
    )
      ? "delivered"
      : "event_webhook_confirmed";
  } else if (activityResponse.status !== 429) {
    throw new Error(`SendGrid Activity API returned HTTP ${activityResponse.status}`);
  }

  console.log(
    JSON.stringify({
      workflow: "production authentication verification",
      categories: {
        "auth.verify-email-otp": signupDelivery.status,
        "auth.sign-in-otp": signInDelivery.status,
        "auth.forget-password-otp": resetDelivery.status,
      },
      providerAccepted: true,
      providerMessageIds: "recorded",
      challenges: "signup_confirmed_signin_completed_password_reset_completed",
      activityStatus,
      temporaryAccount: "removed after delivery evidence",
    }),
  );
} finally {
  await browser?.close();
  if (inboxWasFree && !createdUserId) {
    const [candidate] = await sql`
      select id from core.users
       where lower(email) = lower(${recipient})
         and created_at >= ${startedAt}
       limit 1
    `;
    createdUserId = candidate?.id ?? "";
  }
  if (createdUserId) {
    await sql.begin(async (tx) => {
      await tx`
        delete from core.verifications
         where created_at >= ${startedAt}
           and identifier ilike ${`%${recipient}%`}
      `;
      await tx`
        delete from core.users
         where id = ${createdUserId}
           and lower(email) = lower(${recipient})
      `;
    });
  }
  for (const type of ["email-verification", "sign-in", "forget-password"]) {
    await redis.del(`missao-saber:auth:verification:${type}-otp-${recipient.toLowerCase()}`);
  }
  await redis.quit();
  await sql.end();
}
