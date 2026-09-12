import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";

const require = createRequire(new URL("../../../packages/db/package.json", import.meta.url));
const postgres = require("postgres");
const envPath = new URL("../.env.local", import.meta.url);
const local = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const databaseUrl = process.env.DATABASE_URL ?? local.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });
const days = Math.max(1, Math.min(365, Number(process.argv[2]) || 30));
try {
  const report = await sql.begin("read only", async (tx) => {
    const events =
      await tx`select event, source, count(*)::int as occurrences, count(distinct user_id)::int as adults
      from agenda.product_events where created_at >= now() - make_interval(days => ${days}) group by event, source order by event, source`;
    const activation = await tx`with first_use as (
      select owner_user_id, min(created_at) as started, min(confirmed_at) as confirmed from agenda.notices
      where created_at >= now() - make_interval(days => ${days}) group by owner_user_id
    ) select count(*)::int as households_attempted, count(confirmed)::int as households_confirmed,
      percentile_cont(0.5) within group(order by extract(epoch from confirmed-started)) as median_seconds_first_confirmation
      from first_use`;
    const landing = await tx`select event, landing_context->>'variant' as variant,
        landing_context->>'placement' as placement,
        landing_context #>> '{selection,plan}' as plan,
        landing_context #>> '{selection,cycle}' as cycle,
        landing_context->>'scenario' as scenario, landing_context->>'action' as action,
        count(*)::int as occurrences
      from agenda.product_events
      where event in ('landing_view','landing_cta','landing_demo')
        and created_at >= now() - make_interval(days => ${days})
      group by 1,2,3,4,5,6,7 order by 1,2,3,4,5,6,7`;
    const weekly =
      await tx`select date_trunc('week', created_at at time zone 'America/Sao_Paulo')::date::text as week,
      count(distinct user_id)::int as active_adults from agenda.product_events
      where event in ('notice_confirmed','action_completed') and created_at >= now() - make_interval(days => ${days})
      group by 1 order by 1`;
    const retention = await tx`with cohort as (
      select user_id, min(created_at) as first_action from agenda.product_events
      where event in ('notice_confirmed','action_completed') and user_id is not null group by user_id
    ) select count(*)::int as eligible_adults, count(*) filter(where exists(
      select 1 from agenda.product_events e where e.user_id=c.user_id and e.event in ('notice_confirmed','action_completed')
      and e.created_at>=c.first_action+interval '7 days' and e.created_at<c.first_action+interval '14 days'
    ))::int as returned_week_two from cohort c where c.first_action<=now()-interval '14 days'
      and c.first_action>=now()-make_interval(days => ${days})`;
    // Payment truth comes from successfully processed invoice webhooks, not UI clicks.
    const payments = await tx`with invoices as (
      select c.subject_id, w.payload #>> '{data,object,id}' as invoice_id,
        w.payload #>> '{data,object,billing_reason}' as reason,
        (w.payload #>> '{data,object,amount_paid}')::numeric as cents,
        w.payload #>> '{data,object,currency}' as currency
      from billing.webhook_events w join billing.customers c
        on c.provider='stripe' and c.provider_customer_id=w.payload #>> '{data,object,customer}'
      where c.app='agenda-da-turma' and w.provider='stripe' and w.event_type='invoice.paid'
        and w.processed_at is not null and w.created_at>=now()-make_interval(days => ${days})
    ) select currency, count(distinct subject_id) filter(where reason='subscription_create' and cents>0)::int as paying_households,
      count(distinct subject_id) filter(where reason='subscription_cycle' and cents>0)::int as renewed_households,
      coalesce(sum(cents),0)::text as paid_invoice_cents from (select distinct on(invoice_id) * from invoices) deduplicated group by currency`;
    const subscriptions =
      await tx`select s.status, count(*)::int as subscriptions from billing.subscriptions s
      join billing.customers c on c.id=s.customer_id where c.app='agenda-da-turma' group by s.status`;
    const usage =
      await tx`select count(*)::int as runs, coalesce(sum(u.prompt_tokens),0)::text as prompt_tokens,
      coalesce(sum(u.completion_tokens),0)::text as completion_tokens from ai.agent_runs r left join ai.usage_logs u on u.run_id=r.id
      where r.app='agenda-da-turma' and r.started_at>=now()-make_interval(days => ${days})`;
    const deliveries =
      await tx`select channel,status,count(*)::int as deliveries from agenda.notification_deliveries
      where created_at>=now()-make_interval(days => ${days}) group by channel,status order by channel,status`;
    return {
      events,
      landing,
      activation,
      weekly,
      retention,
      payments,
      subscriptions,
      usage,
      deliveries,
    };
  });
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        windowDays: days,
        definitions: {
          landing_view:
            "Página inicial visível por montagem, sem cookie ou identidade. Retornos contam novamente; não são visitantes únicos.",
          landing_cta:
            "Clique de cadastro por posição, plano e ciclo; repetição idêntica deduplicada na montagem da página.",
          landing_demo:
            "Interação com cenário, planejamento ou conclusão fictícia; cada combinação conta uma vez por montagem.",
          landing_attribution:
            "Eventos anônimos e agregados. Não ligam uma visita a cadastro, confirmação ou pagamento individual; taxas entre etapas são apenas indicativas.",
          qualified_visit:
            "Clique em criar conta na landing; sem cookie ou identidade, não representa visitantes únicos.",
          signup:
            "Conta nova criada pelo fluxo deste app; contas pré-existentes no monorepo não contam novamente.",
          activation:
            "Primeiro recado confirmado por dono da família; não comprova a precisão da extração.",
          retention:
            "Adulto com confirmação ou conclusão na segunda semana; janela completa de 14 dias.",
          costs:
            "Tokens são consumo técnico. Some faturas da IA, e-mail, taxas, tributos, suporte e estornos para medir contribuição.",
          billing:
            "Faturas efetivamente pagas em eventos processados, por moeda. Renovações anuais têm período diferente das mensais.",
        },
        ...report,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
