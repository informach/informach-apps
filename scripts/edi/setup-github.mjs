import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assertKeyRingContinuity,
  decryptBackup,
  dpapi,
  encryptBackup,
  validateKeys,
} from "./protected-keys.mjs";

const { values } = parseArgs({
  options: {
    "initialize-unpublished": { type: "boolean", default: false },
    backup: { type: "string" },
    recipient: { type: "string" },
    identity: { type: "string" },
  },
});
if (!values.backup || !values.recipient || !values.identity)
  throw new Error(
    "Provide --backup <keys.age> --recipient <public key file> --identity <recovery identity> for verified portable recovery",
  );

// Private material is DPAPI-encrypted for the current Windows user, never
// printed, tracked in Git, or reused between licenses and application updates.
if (process.platform !== "win32") throw new Error("Initial key backup requires Windows DPAPI");
const source = "informach/informach-apps";
const distribution = "informach/edi-releases";
const directory = resolve(".cache/edi-configuration");
const keyFile = resolve(directory, "keys.v1.dpapi");
const run = (args, input) =>
  execFileSync("gh", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
const api = (path, method = "GET", body) =>
  JSON.parse(
    run(
      ["api", path, "--method", method, ...(body === undefined ? [] : ["--input", "-"])],
      body === undefined ? undefined : JSON.stringify(body),
    ) || "null",
  );
function key(id) {
  const pair = generateKeyPairSync("ed25519");
  return {
    id,
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
await mkdir(directory, { recursive: true });
let keys;
let initialized = false;
try {
  keys = validateKeys(JSON.parse(dpapi(await readFile(keyFile, "utf8"), true)));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw new Error("Protected key backup cannot be read; existing keys were not replaced", {
      cause: error,
    });
  if (!values["initialize-unpublished"])
    throw new Error(
      "Keys absent. Restore the portable backup; only an unpublished suite can be explicitly initialized.",
    );
  const releases = api(`repos/${distribution}/releases?per_page=1`);
  if (releases.length)
    throw new Error("Distribution already has a release; restore the established signing keys");
  const generation = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  keys = { update: key(`edi-update-${generation}`), license: key(`edi-license-${generation}`) };
  await writeFile(keyFile, dpapi(JSON.stringify(keys), false), { flag: "wx", mode: 0o600 });
  initialized = true;
}
await mkdir(dirname(resolve(values.backup)), { recursive: true });
let backup;
try {
  backup = await readFile(values.backup);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  backup = encryptBackup(keys, values.recipient);
  await writeFile(values.backup, backup, { flag: "wx", mode: 0o600 });
}
const restored = decryptBackup(backup, values.identity);
if (JSON.stringify(restored) !== JSON.stringify(keys))
  throw new Error("Portable backup does not match local keys; remote state unchanged");
function optionalApi(path) {
  try {
    return api(path);
  } catch (error) {
    if (error instanceof Error && "stderr" in error && String(error.stderr).includes("(HTTP 404)"))
      return null;
    throw error;
  }
}
// Validate all existing trust anchors before changing environment policy,
// secrets, variables or the public key file. Restoring an old backup is not rotation.
const existingVariables = Object.fromEntries(
  (
    optionalApi(`repos/${source}/environments/edi-release/variables?per_page=100`)?.variables ?? []
  ).map((entry) => [entry.name, entry.value]),
);
const existingPublicKeys = optionalApi(`repos/${distribution}/contents/update-public-keys.json`);
if (!initialized) {
  const published = api(`repos/${distribution}/releases?per_page=1`).length > 0;
  if (
    existingVariables.EDI_UPDATE_SIGNING_KEY_ID &&
    existingVariables.EDI_UPDATE_SIGNING_KEY_ID !== keys.update.id
  )
    throw new Error("GitHub signing identity drift; use an explicit trust rotation");
  assertKeyRingContinuity(existingVariables.EDI_UPDATE_PUBLIC_KEYS, keys.update, {
    allowEmpty: !published,
  });
  assertKeyRingContinuity(existingVariables.EDI_LICENSE_PUBLIC_KEYS, keys.license, {
    allowEmpty: !published,
  });
  if (existingPublicKeys?.content)
    assertKeyRingContinuity(
      Buffer.from(existingPublicKeys.content, "base64").toString("utf8"),
      keys.update,
      { allowEmpty: !published },
    );
  if (
    published &&
    (!existingVariables.EDI_UPDATE_PUBLIC_KEYS ||
      !existingVariables.EDI_LICENSE_PUBLIC_KEYS ||
      !existingPublicKeys?.content)
  )
    throw new Error(
      "Published distribution is missing trust metadata; restore it before provisioning",
    );
}
const environment = api(`repos/${source}/environments/edi-release`, "PUT", {
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
});
if (!environment.deployment_branch_policy?.custom_branch_policies)
  throw new Error("GitHub environment branch restrictions were not applied");
const policies = api(`repos/${source}/environments/edi-release/deployment-branch-policies`);
for (const policy of [
  { name: "main", type: "branch" },
  { name: "edi-v*", type: "tag" },
]) {
  if (
    !policies.branch_policies.some((item) => item.name === policy.name && item.type === policy.type)
  )
    api(`repos/${source}/environments/edi-release/deployment-branch-policies`, "POST", policy);
}
run(
  ["secret", "set", "EDI_UPDATE_SIGNING_PRIVATE_KEY", "--repo", source, "--env", "edi-release"],
  keys.update.privateKey,
);
const variables = {
  EDI_DISTRIBUTION_REPOSITORY: distribution,
  EDI_UPDATE_SIGNING_KEY_ID: keys.update.id,
  EDI_UPDATE_PUBLIC_KEYS: JSON.stringify({ [keys.update.id]: keys.update.publicKey }),
  EDI_LICENSE_PUBLIC_KEYS: JSON.stringify({ [keys.license.id]: keys.license.publicKey }),
  EDI_DESKTOP_CLIENT_ID: "edi-desktop",
};
for (const [name, value] of Object.entries(variables))
  run(["variable", "set", name, "--repo", source, "--env", "edi-release", "--body", value]);
api(`repos/${distribution}/actions/permissions`, "PUT", { enabled: false });
api(`repos/${distribution}/immutable-releases`, "PUT");
if (!api(`repos/${distribution}/immutable-releases`).enabled)
  throw new Error("GitHub release immutability was not enabled");
async function publicFile(path, content) {
  let previous;
  try {
    previous = api(`repos/${distribution}/contents/${path}`);
  } catch (error) {
    if (
      !(error instanceof Error && "stderr" in error && String(error.stderr).includes("(HTTP 404)"))
    )
      throw error;
  }
  if (previous?.content && Buffer.from(previous.content, "base64").toString("utf8") === content)
    return;
  api(`repos/${distribution}/contents/${path}`, "PUT", {
    message: "docs: configure controlled Edi pilot distribution",
    content: Buffer.from(content).toString("base64"),
    ...(previous ? { sha: previous.sha } : {}),
  });
}
await publicFile(
  "README.md",
  await readFile(new URL("./distribution-readme.md", import.meta.url), "utf8"),
);
await publicFile(
  "update-public-keys.json",
  `${JSON.stringify({ [keys.update.id]: keys.update.publicKey }, null, 2)}\n`,
);
await writeFile(resolve(directory, "public.json"), JSON.stringify(variables, null, 2));
const secrets = api(`repos/${source}/environments/edi-release/secrets`);
console.log(`GitHub distribution configured: ${distribution}`);
console.log(
  `Own update key saved in the protected edi-release environment; separate license key backed up with Windows DPAPI and verified age recovery.`,
);
console.log(`Local protected backup: ${keyFile}`);
console.log(
  `Limited cross-repository publishing token: ${secrets.secrets.some((secret) => secret.name === "EDI_DISTRIBUTION_TOKEN") ? "configured" : "not configured"}`,
);
console.log(
  "Portal URL and backend license key must be provisioned with the actual Edi deployment; no live charges were enabled.",
);
