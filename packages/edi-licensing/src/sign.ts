import { createPrivateKey, type KeyObject, randomUUID, sign } from "node:crypto";
import { EDI_TOOLS } from "@informach/config/edi-tools";
import {
  type LeaseClaims,
  leaseClaimsSchema,
  leaseHeaderSchema,
  MAX_LEASE_SECONDS,
} from "@informach/edi-contracts";

export function createLicenseSigner(config: {
  privateKeyPem: string;
  kid: string;
  issuer: string;
  environment: LeaseClaims["environment"];
}) {
  const key: KeyObject = createPrivateKey(config.privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("License key must be Ed25519");
  const header = leaseHeaderSchema.parse({ alg: "EdDSA", typ: "edi-license+jwt", kid: config.kid });
  return (
    input: Pick<LeaseClaims, "sub" | "deviceId" | "keyThumbprint" | "activationId" | "revision"> & {
      paidThrough: Date;
      now: Date;
      minimumClientVersion: string;
    },
  ): string => {
    const iat = Math.floor(input.now.getTime() / 1000);
    const paidThrough = Math.floor(input.paidThrough.getTime() / 1000);
    const claims = leaseClaimsSchema.parse({
      version: 1,
      iss: config.issuer,
      aud: "edi-desktop",
      environment: config.environment,
      sub: input.sub,
      deviceId: input.deviceId,
      keyThumbprint: input.keyThumbprint,
      activationId: input.activationId,
      revision: input.revision,
      minimumClientVersion: input.minimumClientVersion,
      tools: EDI_TOOLS.map((tool) => tool.id),
      iat,
      nbf: iat,
      exp: Math.min(iat + MAX_LEASE_SECONDS, paidThrough),
      paidThrough,
      jti: randomUUID(),
    });
    const body = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
    return `${body}.${sign(null, Buffer.from(body), key).toString("base64url")}`;
  };
}
