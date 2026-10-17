import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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
function dpapi(value, decrypt) {
  const script = decrypt
    ? "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd());$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"
    : "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force;[Console]::Out.Write((ConvertFrom-SecureString $s))";
  return execFileSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    { input: value, encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
}
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
try {
  keys = JSON.parse(dpapi(await readFile(keyFile, "utf8"), true));
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw new Error("Protected key backup cannot be read; existing keys were not replaced", {
      cause: error,
    });
  keys = { update: key("edi-pilot-2026-10"), license: key("edi-license-2026-10") };
  await writeFile(keyFile, dpapi(JSON.stringify(keys), false), { flag: "wx", mode: 0o600 });
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
  `Own update key saved in the protected edi-release environment; separate license key backed up with Windows DPAPI.`,
);
console.log(`Local protected backup: ${keyFile}`);
console.log(
  `Limited cross-repository publishing token: ${secrets.secrets.some((secret) => secret.name === "EDI_DISTRIBUTION_TOKEN") ? "configured" : "not configured"}`,
);
console.log(
  "Portal URL and backend license key must be provisioned with the actual Edi deployment; no live charges were enabled.",
);
