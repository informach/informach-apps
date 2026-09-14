import postgres from "postgres";

const recipient = process.env.MISSAO_EMAIL_TEST_RECIPIENT;
const since = process.env.MISSAO_EMAIL_TEST_SINCE;
const databaseUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!recipient || !since || Number.isNaN(Date.parse(since)))
  throw new Error("Set the authorized recipient and evidence start timestamp");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15 });
try {
  const rows = await sql`
    select category,
           status,
           provider_accepted,
           provider_message_id is not null as has_provider_id,
           sent_at is not null as has_sent_at,
           extract(epoch from (updated_at - sent_at)) * 1000 as webhook_lag_ms,
           last_error
      from core.email_deliveries
     where recipient = ${recipient}
       and created_at >= ${new Date(since)}
     order by created_at
  `;
  console.log(JSON.stringify(rows));
} finally {
  await sql.end();
}
