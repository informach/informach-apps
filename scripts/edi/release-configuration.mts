import { createPublicKey } from "node:crypto";
import { z } from "zod";
import { releaseVersionSchema } from "../../packages/edi-contracts/src/index";
import { desktopConfigSchema } from "../../packages/edi-desktop/src/contracts";

export function publicationTrustKeys(input: unknown): Record<string, string> {
  const keys = z.record(z.string().regex(/^[A-Za-z0-9._-]{1,80}$/), z.string().min(1)).parse(input);
  if (!Object.keys(keys).length) throw new Error("No update trust anchors configured");
  for (const pem of Object.values(keys)) {
    if (createPublicKey(pem).asymmetricKeyType !== "ed25519")
      throw new Error("Trust anchors require Ed25519");
  }
  return keys;
}

/** Public build configuration only. Never export private keys into GITHUB_ENV. */
export function releaseEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  for (const name of [
    "EDI_RELEASE_TAG",
    "EDI_PORTAL_URL",
    "EDI_DESKTOP_CLIENT_ID",
    "EDI_DISTRIBUTION_REPOSITORY",
    "EDI_LICENSE_PUBLIC_KEYS",
    "EDI_UPDATE_PUBLIC_KEYS",
    "EDI_UPDATE_SIGNING_KEY_ID",
  ])
    if (!environment[name]?.trim()) throw new Error(`Missing release configuration: ${name}`);
  const version = releaseVersionSchema.parse(environment.EDI_RELEASE_TAG?.replace(/^edi-v/, ""));
  const config = desktopConfigSchema.parse({
    portalUrl: environment.EDI_PORTAL_URL,
    clientId: environment.EDI_DESKTOP_CLIENT_ID,
    environment: "production",
    publisher: "Informach — sem Authenticode",
    downloadHost: "github.com",
    distributionRepository: environment.EDI_DISTRIBUTION_REPOSITORY,
    updateChannel: version.includes("-beta.") ? "beta" : "stable",
    trustedKeys: JSON.parse(environment.EDI_LICENSE_PUBLIC_KEYS ?? "{}"),
    updateKeys: JSON.parse(environment.EDI_UPDATE_PUBLIC_KEYS ?? "{}"),
  });
  const fingerprints = (keys: Readonly<Record<string, string>>) =>
    Object.entries(keys).map(([id, pem]) => {
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) throw new Error("Invalid public signing key ID");
      const key = createPublicKey(pem);
      if (key.asymmetricKeyType !== "ed25519") throw new Error("Trust anchors require Ed25519");
      return key.export({ type: "spki", format: "der" }).toString("base64");
    });
  const licenseKeys = fingerprints(config.trustedKeys);
  const updateKeys = fingerprints(config.updateKeys);
  if (licenseKeys.some((key) => updateKeys.includes(key)))
    throw new Error("License and update identities must use different keys");
  const keyId = environment.EDI_UPDATE_SIGNING_KEY_ID;
  if (!keyId || !Object.hasOwn(config.updateKeys, keyId))
    throw new Error("The update signing identity has no embedded public trust anchor");
  return {
    EDI_RELEASE_TAG: `edi-v${version}`,
    EDI_PORTAL_URL: config.portalUrl,
    EDI_DESKTOP_CLIENT_ID: config.clientId,
    EDI_DISTRIBUTION_REPOSITORY: config.distributionRepository,
    EDI_LICENSE_PUBLIC_KEYS: JSON.stringify(config.trustedKeys),
    EDI_UPDATE_PUBLIC_KEYS: JSON.stringify(config.updateKeys),
    EDI_UPDATE_SIGNING_KEY_ID: keyId,
  };
}
