import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { assertBackendKeyContinuity, dpapi, validateKeys } from "./protected-keys.mjs";

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    environment: { type: "string" },
    service: { type: "string" },
    railway: { type: "string", default: "railway" },
    "stripe-env": { type: "string" },
    apply: { type: "boolean", default: false },
  },
});
if (!values.project || !values.environment || !values.service)
  throw new Error(
    "Provide explicit --project, --environment and --service; --apply writes backend variables",
  );
const selectors = [
  "--project",
  values.project,
  "--environment",
  values.environment,
  "--service",
  values.service,
];
function railway(args, input) {
  try {
    return execFileSync(values.railway, args, {
      input,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Railway variable operation failed; secret output suppressed");
  }
}
const current = JSON.parse(railway(["variable", "list", ...selectors, "--json"]));
const keys = validateKeys(
  JSON.parse(dpapi(await readFile(".cache/edi-configuration/keys.v1.dpapi", "utf8"), true)),
);
assertBackendKeyContinuity(keys, current);
const desired = {
  BETTER_AUTH_SECRET: current.BETTER_AUTH_SECRET || randomBytes(48).toString("base64url"),
  CRON_SECRET: current.CRON_SECRET || randomBytes(48).toString("base64url"),
  EDI_LICENSE_KEY_ID: keys.license.id,
  EDI_LICENSE_PRIVATE_KEY: keys.license.privateKey.trim(),
  EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ [keys.update.id]: keys.update.publicKey }),
};
if (values["stripe-env"]) {
  const path = resolve(values["stripe-env"]);
  const relativePath = relative(fileURLToPath(new URL("../../", import.meta.url)), path);
  if (!isAbsolute(relativePath) && relativePath.split(sep)[0] !== "..")
    throw new Error("Stripe credentials must be read from outside the repository");
  const stripe = parseEnv(await readFile(path, "utf8"));
  const allowed = new Set([
    "EDI_BILLING_ENABLED",
    "STRIPE_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PORTAL_CONFIGURATION_ID",
    "EDI_MONTHLY_PRICE_PROD",
    "EDI_ANNUAL_PRICE_PROD",
  ]);
  if (
    Object.keys(stripe).length !== allowed.size ||
    Object.keys(stripe).some((name) => !allowed.has(name)) ||
    stripe.EDI_BILLING_ENABLED !== "false" ||
    stripe.STRIPE_MODE !== "prod" ||
    !/^(sk|rk)_live_/.test(stripe.STRIPE_SECRET_KEY ?? "") ||
    !/^whsec_/.test(stripe.STRIPE_WEBHOOK_SECRET ?? "") ||
    !/^bpc_/.test(stripe.STRIPE_PORTAL_CONFIGURATION_ID ?? "") ||
    !/^price_/.test(stripe.EDI_MONTHLY_PRICE_PROD ?? "") ||
    !/^price_/.test(stripe.EDI_ANNUAL_PRICE_PROD ?? "") ||
    stripe.EDI_MONTHLY_PRICE_PROD === stripe.EDI_ANNUAL_PRICE_PROD
  )
    throw new Error(
      "Invalid production Stripe bootstrap configuration; billing must stay disabled",
    );
  Object.assign(desired, stripe);
}
const changed = Object.keys(desired).filter((name) => current[name] !== desired[name]);
if (values.apply) {
  for (const name of changed)
    railway(
      ["variable", "set", name, ...selectors, "--stdin", "--skip-deploys", "--json"],
      desired[name],
    );
  const verified = JSON.parse(railway(["variable", "list", ...selectors, "--json"]));
  if (Object.entries(desired).some(([name, value]) => verified[name] !== value))
    throw new Error("Backend variable verification failed");
}
console.log(
  JSON.stringify({
    applied: values.apply,
    variableNames: changed,
    licenseKeyId: keys.license.id,
    updateKeyId: keys.update.id,
  }),
);
