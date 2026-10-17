import { EDI_TOOLS } from "@informach/config/edi-tools";
import { z } from "zod";

export const MAX_LEASE_SECONDS = 72 * 60 * 60;
export const MAX_DEVICE_ACTIVATIONS = 2;
export const CLOCK_SKEW_SECONDS = 60;
export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export const toolIdSchema = z.enum(EDI_TOOLS.map((tool) => tool.id));
export const desktopAppIdSchema = z.enum([
  "edi-hub",
  "ediaula",
  "edicaptura",
  "edifoto",
  "edipdf",
  "edisvg",
]);
export const environmentSchema = z.enum(["development", "production"]);
export const channelSchema = z.enum(["stable", "beta"]);
export const keyThumbprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const leaseHeaderSchema = z.strictObject({
  alg: z.literal("EdDSA"),
  typ: z.literal("edi-license+jwt"),
  kid: z.string().min(1).max(80),
});
export const leaseClaimsSchema = z
  .strictObject({
    version: z.literal(1),
    iss: z.url(),
    aud: z.literal("edi-desktop"),
    environment: environmentSchema,
    sub: z.string().min(1).max(200),
    deviceId: z.uuid(),
    keyThumbprint: keyThumbprintSchema,
    activationId: z.uuid(),
    revision: z.int().nonnegative(),
    tools: z
      .array(toolIdSchema)
      .min(1)
      .max(5)
      .refine((tools) => new Set(tools).size === tools.length),
    iat: z.int().positive(),
    nbf: z.int().positive(),
    exp: z.int().positive(),
    paidThrough: z.int().positive(),
    jti: z.uuid(),
  })
  .refine(
    (lease) =>
      lease.nbf === lease.iat &&
      lease.exp > lease.iat &&
      lease.exp <= lease.paidThrough &&
      lease.exp - lease.iat <= MAX_LEASE_SECONDS,
    { message: "Invalid license validity window" },
  );
export type LeaseClaims = z.infer<typeof leaseClaimsSchema>;
export type LeaseHeader = z.infer<typeof leaseHeaderSchema>;

export const activationRequestSchema = z.strictObject({
  deviceId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  publicKeySpki: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .max(256),
});
export const licenseRequestSchema = z.strictObject({
  deviceId: z.uuid(),
  sessionId: z.uuid(),
  toolId: toolIdSchema,
});
export const activationResponseSchema = z.strictObject({
  userId: z.string().min(1),
  deviceId: z.uuid(),
  activationId: z.uuid(),
  sessionId: z.uuid(),
  keyThumbprint: keyThumbprintSchema,
  expiresAt: z.iso.datetime(),
  serverTime: z.int().positive(),
});
export const logoutRequestSchema = z.strictObject({ deviceId: z.uuid(), sessionId: z.uuid() });
export const accessDenialSchema = z.enum([
  "subscription_required",
  "payment_required",
  "suspended",
  "device_revoked",
  "device_limit",
  "session_revoked",
  "update_required",
  "invalid_proof",
]);
export const licenseResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("granted"),
    lease: z.string().min(1).max(8192),
    serverTime: z.int().positive(),
  }),
  z.strictObject({
    status: z.literal("denied"),
    reason: accessDenialSchema,
    serverTime: z.int().positive(),
  }),
]);
export type LicenseResponse = z.infer<typeof licenseResponseSchema>;

export const releaseVersionSchema = z
  .string()
  .max(80)
  .regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.(?:0|[1-9]\d*))?$/)
  .refine(
    (version) =>
      version.split(/\.|-beta\./).every((part) => /^\d+$/.test(part) && BigInt(part) <= 65535n),
    {
      message: "Version components must fit Windows version resources",
    },
  );
export const artifactSchema = z.strictObject({
  appId: desktopAppIdSchema,
  platform: z.literal("win32"),
  arch: z.literal("x64"),
  url: z.url().refine((url) => new URL(url).protocol === "https:"),
  sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
  size: z.int().positive(),
  publisher: z.string().min(1).max(200),
});
export const releaseManifestSchema = z
  .strictObject({
    version: releaseVersionSchema,
    channel: channelSchema,
    publishedAt: z.iso.datetime(),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    notes: z.string().max(10000),
    artifacts: z.array(artifactSchema).length(6),
  })
  .refine(
    (release) =>
      new Set(release.artifacts.map((artifact) => artifact.appId)).size === 6 &&
      (release.channel === "beta") === release.version.includes("-beta."),
    { message: "Release must contain all six unique apps in the correct channel" },
  );
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type DesktopAppId = z.infer<typeof desktopAppIdSchema>;
export const buildArtifactSchema = z.strictObject({
  version: releaseVersionSchema,
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  artifact: artifactSchema,
});

export const githubRepositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/);
export const releaseSignatureSchema = z.strictObject({
  keyId: z.string().regex(/^[A-Za-z0-9._-]{1,80}$/),
  value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
const signaturesSchema = z
  .array(releaseSignatureSchema)
  .min(1)
  .max(4)
  .refine((items) => new Set(items.map((item) => item.keyId)).size === items.length);
export const signedReleaseSchema = z.strictObject({
  format: z.literal("edi-release-v1"),
  manifest: releaseManifestSchema,
  signatures: signaturesSchema,
});
export type SignedRelease = z.infer<typeof signedReleaseSchema>;

// Paths are portable relative Windows paths, without ADS, traversal or device names.
export const installationPathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.includes("\\") &&
      path
        .split("/")
        .every(
          (part) =>
            /^[^<>:"|?*]+$/.test(part) &&
            ![...part].some((character) => character.charCodeAt(0) < 32) &&
            part !== "." &&
            part !== ".." &&
            !/[. ]$/.test(part) &&
            !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        ),
  );
export const installationManifestSchema = z
  .strictObject({
    appId: desktopAppIdSchema,
    version: releaseVersionSchema,
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    files: z
      .array(
        z.strictObject({
          path: installationPathSchema,
          sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
          size: z
            .int()
            .nonnegative()
            .max(2 * 1024 ** 3),
        }),
      )
      .min(2)
      .max(5000),
  })
  .refine(
    (manifest) =>
      new Set(manifest.files.map((file) => file.path.toLowerCase())).size ===
        manifest.files.length && manifest.files.some((file) => file.path === "resources/app.asar"),
    { message: "Installation requires an ASAR and unique file paths" },
  );
export type InstallationManifest = z.infer<typeof installationManifestSchema>;
export const signedInstallationSchema = z.strictObject({
  format: z.literal("edi-installation-v1"),
  manifest: installationManifestSchema,
  signatures: signaturesSchema,
});
export type SignedInstallation = z.infer<typeof signedInstallationSchema>;

export function releaseArtifactUrl(
  repository: string,
  version: string,
  appId: DesktopAppId,
): string {
  githubRepositorySchema.parse(repository);
  releaseVersionSchema.parse(version);
  desktopAppIdSchema.parse(appId);
  return `https://github.com/${repository}/releases/download/edi-v${version}/${appId}-${version}-win-x64.exe`;
}

/** Compare only canonical suite versions; numeric components never lose precision. */
export function compareReleaseVersions(left: string, right: string): number {
  const a = releaseVersionSchema.parse(left).split(/\.|-beta\./);
  const b = releaseVersionSchema.parse(right).split(/\.|-beta\./);
  for (let index = 0; index < 3; index++) {
    const av = BigInt(a[index] ?? "0");
    const bv = BigInt(b[index] ?? "0");
    if (av !== bv) return av > bv ? 1 : -1;
  }
  if (a.length === 3 && b.length !== 3) return 1;
  if (a.length !== 3 && b.length === 3) return -1;
  const av = BigInt(a[3] ?? "0");
  const bv = BigInt(b[3] ?? "0");
  return av === bv ? 0 : av > bv ? 1 : -1;
}
