"""Production provisioning helpers. Credentials stay in memory; never print API payloads.

Run from the monorepo root. Commands are explicit; importing this file has no side effects.
"""
import json
import pathlib
import os
import subprocess
import urllib.request
import urllib.error
import shlex
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[3]
PROJECT = "f4da4285-5b98-48b5-b03e-5be02f4e7c56"
ENVIRONMENT = "174b2cb0-e1cd-410c-8764-d913e3af18d3"
SERVICE = "91f572ad-b55c-4938-9967-0650c90e49c6"
DOMAIN = "missao-saber.informach.com.br"


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


def variables(service):
    cli = pathlib.Path(os.environ["APPDATA"]) / "npm/node_modules/@railway/cli/bin/railway.js"
    result = subprocess.run(["node", str(cli), "variable", "list", "--service", service, "--environment", ENVIRONMENT, "--project", PROJECT, "--json"], cwd=ROOT, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError("Could not read Railway variables for " + service)
    return json.loads(result.stdout)


def set_variables(service, values):
    railway("mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }", {"input": {"projectId": PROJECT, "environmentId": ENVIRONMENT, "serviceId": service, "variables": values, "skipDeploys": True}})


def configure_service(service, values):
    return railway("mutation($service: String!, $environment: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $service, environmentId: $environment, input: $input) }", {"service": service, "environment": ENVIRONMENT, "input": values})


if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["configure-service"]:
        configure_service(SERVICE, json.loads((ROOT / "apps/missao-saber/railway-service.json").read_text()))
        print("Service configuration applied")
    elif sys.argv[1:] == ["configure-cron"]:
        cron = "5a361c2e-96d0-4dbc-9993-f7c0ff3cd13b"
        values = variables(SERVICE)
        dsn = urlparse(values["SENTRY_DSN"])
        set_variables(cron, {
            "CRON_SECRET": values["CRON_SECRET"],
            "APP_ORIGIN": "https://" + DOMAIN,
            "SENTRY_DSN": values["SENTRY_DSN"],
            "SENTRY_ENVELOPE_URL": f"https://{dsn.hostname}/api{dsn.path}/envelope/",
        })
        config = json.loads((ROOT / "apps/missao-saber/railway-cron.json").read_text())
        config["startCommand"] = "sh -c " + shlex.quote((ROOT / "apps/missao-saber/scripts/maintenance-cron.sh").read_text())
        configure_service(cron, config)
        print("Cron configuration applied; deploy the service to activate changes")
    else:
        raise SystemExit("Choose configure-service or configure-cron. No default mutations.")
