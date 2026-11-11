"""Compasso production variables for the new Conta and Dia de Estrela services.

Credentials stay in memory and are never printed. Run from the monorepo root,
with the Railway CLI logged in. Every command is explicit; importing this file
has no side effects, and no command deploys anything (skipDeploys).

  python scripts/compasso/production.py set-conta-variables < stripe-live.json
  python scripts/compasso/production.py set-estrela-variables < sentry-dsn.txt
  python scripts/compasso/production.py sync-cron-variables
  python scripts/compasso/production.py check

`stripe-live.json` is the JSON printed by `stripe-provision.mts --mode prod`.
"""
import json
import pathlib
import secrets
import shutil
import subprocess
import sys
import urllib.request
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROJECT = "f4da4285-5b98-48b5-b03e-5be02f4e7c56"
ENVIRONMENT = "174b2cb0-e1cd-410c-8764-d913e3af18d3"
CONTA = "@informach/conta"
ESTRELA = "@informach/dia-de-estrela"
ESTRELA_ORIGIN = "https://dia-de-estrela.informach.com.br"
# A service already running in production with the same Postgres, Redis,
# SendGrid, Sentry organization and live Stripe account.
DONOR = "@informach/missao-saber"
PRICE_VARIABLES = (
    "COMPASSO_MONTHLY_PRICE",
    "COMPASSO_ANNUAL_PRICE",
    "COMPASSO_CREDITS_100_PRICE",
    "COMPASSO_CREDITS_300_PRICE",
    "COMPASSO_CREDITS_1000_PRICE",
)


def railway(query, variables=None):
    config = json.loads((pathlib.Path.home() / ".railway/config.json").read_text())
    request = urllib.request.Request(
        "https://backboard.railway.app/graphql/v2",
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + config["user"]["accessToken"],
            "User-Agent": "railway/4.66.0",
        },
    )
    result = json.load(urllib.request.urlopen(request, timeout=45))
    if result.get("errors"):
        raise RuntimeError("Railway API error: " + "; ".join(e["message"] for e in result["errors"]))
    return result["data"]


def service_id(name):
    data = railway("query($id: String!) { project(id: $id) { services { edges { node { id name } } } } }", {"id": PROJECT})
    for edge in data["project"]["services"]["edges"]:
        if edge["node"]["name"] == name:
            return edge["node"]["id"]
    raise RuntimeError(name + " does not exist yet; create it with railway add first")


def raw_variables(service):
    """Values as stored, keeping references such as ${{Postgres.DATABASE_URL}}."""
    query = "query($p: String!, $e: String!, $s: String) { variables(projectId: $p, environmentId: $e, serviceId: $s, unrendered: true) }"
    return railway(query, {"p": PROJECT, "e": ENVIRONMENT, "s": service_id(service)})["variables"]


def rendered_variables(service):
    query = "query($p: String!, $e: String!, $s: String) { variables(projectId: $p, environmentId: $e, serviceId: $s) }"
    return railway(query, {"p": PROJECT, "e": ENVIRONMENT, "s": service_id(service)})["variables"]


def set_variables(service, values):
    railway(
        "mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }",
        {"input": {"projectId": PROJECT, "environmentId": ENVIRONMENT, "serviceId": service_id(service), "variables": values, "skipDeploys": True}},
    )


def keep_or_new(current, name, size=48):
    """Secrets are generated once; rerunning keeps sessions, trial digests and cron auth."""
    return current.get(name) or secrets.token_urlsafe(size)


def conta_values(stripe):
    if stripe.get("mode") != "prod" or not stripe.get("portalConfigurationId", "").startswith("bpc_"):
        raise SystemExit("Expected the live output of stripe-provision.mts with a portal")
    prices = stripe.get("variables", {})
    if sorted(prices) != sorted(PRICE_VARIABLES) or not all(v.startswith("price_") for v in prices.values()):
        raise SystemExit("Expected the five live Compasso prices")
    donor = raw_variables(DONOR)
    current = raw_variables(CONTA)
    key = rendered_variables(DONOR).get("STRIPE_SECRET_KEY", "")
    if not (key.startswith("sk_live_") or key.startswith("rk_live_")):
        raise SystemExit("The donor service has no live Stripe key")
    values = {
        "BETTER_AUTH_SECRET": keep_or_new(current, "BETTER_AUTH_SECRET"),
        # Durable: never rotate without migrating the trial receipts.
        "COMPASSO_TRIAL_HASH_SECRET": keep_or_new(current, "COMPASSO_TRIAL_HASH_SECRET"),
        "CRON_SECRET": keep_or_new(current, "CRON_SECRET"),
        # Sales stay closed until the cutover gates; see apps/conta/PRODUCAO.md.
        "COMPASSO_BILLING_ENABLED": current.get("COMPASSO_BILLING_ENABLED") or "false",
        "STRIPE_MODE": "prod",
        "STRIPE_SECRET_KEY": donor["STRIPE_SECRET_KEY"],
        "STRIPE_PORTAL_CONFIGURATION_ID": stripe["portalConfigurationId"],
    }
    values.update(prices)
    return values


def estrela_values(sentry_dsn):
    if not sentry_dsn.startswith("https://") or "ingest" not in sentry_dsn:
        raise SystemExit("Pass the Dia de Estrela Sentry DSN on stdin")
    donor = raw_variables(DONOR)
    current = raw_variables(ESTRELA)
    values = {name: donor[name] for name in (
        "DATABASE_URL", "REDIS_URL", "SENDGRID_API_KEY", "SENDGRID_WEBHOOK_PUBLIC_KEY", "SENTRY_AUTH_TOKEN", "SENTRY_ORG",
    )}
    if not current.get("VAPID_PUBLIC_KEY") or not current.get("VAPID_PRIVATE_KEY"):
        npx = shutil.which("npx") or shutil.which("npx.cmd")
        generated = subprocess.run(
            [npx, "--yes", "web-push", "generate-vapid-keys", "--json"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
        pair = json.loads(generated.stdout)
        values["VAPID_PUBLIC_KEY"] = pair["publicKey"]
        values["VAPID_PRIVATE_KEY"] = pair["privateKey"]
    values.update({
        "NODE_ENV": "production",
        "NPM_CONFIG_PRODUCTION": "false",
        "LOG_LEVEL": "info",
        "BETTER_AUTH_URL": ESTRELA_ORIGIN,
        "NEXT_PUBLIC_APP_URL": ESTRELA_ORIGIN,
        "EMAIL_SANDBOX_MODE": "live",
        "SENDGRID_FROM": "Dia de Estrela <nao-responda@informach.com.br>",
        "SENTRY_DSN": sentry_dsn,
        "NEXT_PUBLIC_SENTRY_DSN": sentry_dsn,
        "SENTRY_PROJECT": "dia-de-estrela",
        "BETTER_AUTH_SECRET": keep_or_new(current, "BETTER_AUTH_SECRET"),
        "CRON_SECRET": keep_or_new(current, "CRON_SECRET"),
    })
    return values


def sync_cron_variables():
    """Only after the apply has created the cron services."""
    values = rendered_variables(ESTRELA)
    dsn = urlparse(values["SENTRY_DSN"])
    set_variables("cron-dia-de-estrela-alertas", {
        "CRON_SECRET": values["CRON_SECRET"],
        "APP_ORIGIN": ESTRELA_ORIGIN,
        "SENTRY_DSN": values["SENTRY_DSN"],
        "SENTRY_ENVELOPE_URL": f"https://{dsn.hostname}/api{dsn.path}/envelope/",
    })


def check():
    """Names and kinds only: never values."""
    for service in (CONTA, ESTRELA):
        stored = raw_variables(service)
        print(service + ": " + ", ".join(sorted(stored)))


if __name__ == "__main__":
    command = sys.argv[1:2]
    if command == ["set-conta-variables"]:
        set_variables(CONTA, conta_values(json.loads(sys.stdin.read())))
        print("Conta variables saved; the Stripe webhook secret is added once the Conta is live")
    elif command == ["set-estrela-variables"]:
        set_variables(ESTRELA, estrela_values(sys.stdin.read().strip()))
        print("Dia de Estrela variables saved")
    elif command == ["sync-cron-variables"]:
        sync_cron_variables()
        print("Cron variables synced")
    elif command == ["check"]:
        check()
    else:
        raise SystemExit("Choose set-conta-variables, set-estrela-variables, sync-cron-variables or check.")
