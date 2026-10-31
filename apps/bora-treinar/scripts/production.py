"""Production provisioning helpers. Credentials stay in memory; never print API payloads.

Run from the monorepo root. Commands are explicit; importing this file has no side effects.
"""
import json
import os
import pathlib
import secrets
import subprocess
import sys
import urllib.request
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[3]
PROJECT = "f4da4285-5b98-48b5-b03e-5be02f4e7c56"
ENVIRONMENT = "174b2cb0-e1cd-410c-8764-d913e3af18d3"
APP = "@informach/bora-treinar"
CRONS = ("cron-bora-treinar-billing", "cron-bora-treinar-lembretes")
DOMAIN = "bora-treinar.informach.com.br"
# Shared values are copied from a service that already runs in production with
# the same Postgres, Redis, SendGrid and Sentry organization.
DONOR = "@informach/missao-saber"
SHARED = (
    "DATABASE_URL",
    "REDIS_URL",
    "SENDGRID_API_KEY",
    "SENDGRID_WEBHOOK_PUBLIC_KEY",
    "SENTRY_AUTH_TOKEN",
    "SENTRY_ORG",
    "STRIPE_SECRET_KEY",
)


def railway(query, variables=None):
    config = json.loads((pathlib.Path.home() / ".railway/config.json").read_text())
    request = urllib.request.Request(
        "https://backboard.railway.app/graphql/v2",
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + config["user"]["accessToken"], "User-Agent": "railway/4.66.0"},
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
    raise RuntimeError(name + " does not exist yet; run railway config apply first")


def variables(service):
    cli = pathlib.Path(os.environ["APPDATA"]) / "npm/node_modules/@railway/cli/bin/railway.js"
    result = subprocess.run(["node", str(cli), "variable", "list", "--service", service, "--environment", ENVIRONMENT, "--project", PROJECT, "--json"], cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError("Could not read Railway variables for " + service)
    return json.loads(result.stdout)


def set_variables(service, values):
    railway("mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }", {"input": {"projectId": PROJECT, "environmentId": ENVIRONMENT, "serviceId": service_id(service), "variables": values, "skipDeploys": True}})


def app_variables(sentry_dsn):
    """Everything the app needs except the Stripe catalog, portal and webhook."""
    donor = variables(DONOR)
    current = variables(APP)
    origin = "https://" + DOMAIN
    values = {name: donor[name] for name in SHARED}
    values.update({
        "NODE_ENV": "production",
        "NPM_CONFIG_PRODUCTION": "false",
        "LOG_LEVEL": "info",
        "BETTER_AUTH_URL": origin,
        "NEXT_PUBLIC_APP_URL": origin,
        "EMAIL_SANDBOX_MODE": "live",
        "SENDGRID_FROM": "Bora Treinar <nao-responda@informach.com.br>",
        "STRIPE_MODE": "prod",
        "SENTRY_DSN": sentry_dsn,
        "NEXT_PUBLIC_SENTRY_DSN": sentry_dsn,
        "SENTRY_PROJECT": "bora-treinar",
    })
    # Secrets are generated once; rerunning keeps sessions and cron auth valid.
    for name in ("BETTER_AUTH_SECRET", "CRON_SECRET"):
        values[name] = current.get(name) or secrets.token_urlsafe(48)
    return values


def sync_cron_variables():
    values = variables(APP)
    dsn = urlparse(values["SENTRY_DSN"])
    for cron in CRONS:
        set_variables(cron, {
            "CRON_SECRET": values["CRON_SECRET"],
            "APP_ORIGIN": "https://" + DOMAIN,
            "SENTRY_DSN": values["SENTRY_DSN"],
            "SENTRY_ENVELOPE_URL": f"https://{dsn.hostname}/api{dsn.path}/envelope/",
        })


if __name__ == "__main__":
    # Imagem, agenda e comando dos serviços vivem em .railway/railway.ts (IaC).
    # Aqui só gravamos variáveis; nenhum comando publica.
    command = sys.argv[1:2]
    if command == ["set-app-variables"]:
        set_variables(APP, app_variables(sys.stdin.read().strip()))
        print("App variables saved; Stripe values come from provision-stripe.mjs prod")
    elif command == ["sync-cron-variables"]:
        sync_cron_variables()
        print("Cron variables synced; redeploy each cron to activate them")
    else:
        raise SystemExit("Choose set-app-variables (Sentry DSN on stdin) or sync-cron-variables. No default mutations.")
