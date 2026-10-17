import "server-only";
import { db } from "@informach/db";
import { createDesktopLicenseService, createLicenseSigner } from "@informach/edi-licensing";
import { getEnv } from "./env";

let service: ReturnType<typeof createDesktopLicenseService> | undefined;
export function getLicensing() {
  if (service) return service;
  const env = getEnv();
  if (!env.EDI_LICENSE_PRIVATE_KEY || !env.EDI_LICENSE_KEY_ID)
    throw new Error("licensing_not_configured");
  service = createDesktopLicenseService({
    db,
    audience: `${env.NEXT_PUBLIC_APP_URL}/api/desktop`,
    sign: createLicenseSigner({
      privateKeyPem: env.EDI_LICENSE_PRIVATE_KEY.replaceAll("\\n", "\n"),
      kid: env.EDI_LICENSE_KEY_ID,
      issuer: env.NEXT_PUBLIC_APP_URL,
      environment: env.NODE_ENV === "production" ? "production" : "development",
    }),
  });
  return service;
}
