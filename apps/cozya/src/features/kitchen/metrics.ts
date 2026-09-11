import "server-only";
import { db, sql } from "@informach/db";

/** Aggregates only; no user identifiers, recipe text or profile contents in the response. */
export async function getKitchenMetrics() {
  const [funnel, weekly, costs, billing] = await Promise.all([
    db.execute(
      sql`WITH cohort AS (
        SELECT user_id, MIN(occurred_at) AS started FROM cozya.product_events
        WHERE name = 'trial_started' AND occurred_at >= now() - interval '90 days' GROUP BY user_id
      ), saved AS (
        SELECT c.*, (SELECT MIN(occurred_at) FROM cozya.product_events e WHERE e.user_id = c.user_id AND e.name = 'recipe_saved' AND e.occurred_at BETWEEN c.started AND c.started + interval '7 days') AS saved_at FROM cohort c
      ), planned AS (
        SELECT s.*, (SELECT MIN(occurred_at) FROM cozya.product_events e WHERE e.user_id = s.user_id AND e.name = 'plan_completed' AND e.occurred_at BETWEEN s.saved_at AND s.started + interval '7 days') AS planned_at FROM saved s
      ), shopped AS (
        SELECT p.*, (SELECT MIN(occurred_at) FROM cozya.product_events e WHERE e.user_id = p.user_id AND e.name = 'shopping_used' AND e.occurred_at BETWEEN p.planned_at AND p.started + interval '7 days') AS shopped_at FROM planned p
      ), cooked AS (
        SELECT s.*, (SELECT MIN(occurred_at) FROM cozya.product_events e WHERE e.user_id = s.user_id AND e.name = 'cooking_completed' AND e.occurred_at BETWEEN s.shopped_at AND s.started + interval '7 days') AS cooked_at FROM shopped s
      ) SELECT count(*)::int AS trials, count(saved_at)::int AS saved_recipe, count(planned_at)::int AS planned_after_save, count(shopped_at)::int AS shopped_after_plan, count(cooked_at)::int AS completed_loop FROM cooked`,
    ),
    db.execute(
      sql`WITH activity AS (
        SELECT date_trunc('week', occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS week, user_id,
          count(*) FILTER (WHERE name = 'cooking_completed') AS preparations,
          bool_or(name = 'plan_completed') AS planned, bool_or(name = 'plan_repeated') AS repeated, bool_or(name = 'offer_seen') AS offer_seen
        FROM cozya.product_events WHERE occurred_at >= now() - interval '90 days' GROUP BY 1, 2
      ) SELECT week, count(*) FILTER (WHERE preparations > 0)::int AS cooking_users,
        count(*) FILTER (WHERE preparations >= 3)::int AS households_with_three_preparations,
        count(*) FILTER (WHERE planned)::int AS planning_users,
        count(*) FILTER (WHERE repeated)::int AS repeating_users,
        count(*) FILTER (WHERE offer_seen)::int AS offer_viewers
      FROM activity GROUP BY week ORDER BY week`,
    ),
    db.execute(
      sql`SELECT date_trunc('week', started_at AT TIME ZONE 'America/Sao_Paulo')::date AS week, count(*)::int AS model_stages, count(*) FILTER (WHERE status = 'failed')::int AS failed_stages, count(*) FILTER (WHERE metadata ? 'providerCostUsd')::int AS stages_with_cost, SUM(CASE WHEN jsonb_typeof(metadata->'providerCostUsd') = 'number' THEN (metadata->>'providerCostUsd')::numeric END) AS reported_usd, percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at)) AS p95_stage_seconds FROM ai.agent_runs WHERE app = 'cozya' AND started_at >= now() - interval '90 days' GROUP BY 1 ORDER BY 1`,
    ),
    db.execute(
      sql`SELECT event_type, count(*)::int AS events FROM audit.events WHERE payload->>'app' = 'cozya' AND event_type IN ('billing.checkout_started', 'billing.subscription_created', 'billing.payment_succeeded', 'billing.subscription_canceled') AND created_at >= now() - interval '90 days' GROUP BY event_type ORDER BY event_type`,
    ),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    windowDays: 90,
    funnel: Array.from(funnel),
    weekly: Array.from(weekly),
    providerCosts: Array.from(costs),
    billingEvents: Array.from(billing),
    notes: [
      "Custos ausentes são desconhecidos; totais reportados não representam margem líquida.",
      "O funil usa ações ordenadas nos primeiros 7 dias após ativar o teste.",
      "Estes dados refletem este ambiente. Contas de teste não demonstram demanda ou receita real.",
    ],
  };
}
