import { z } from "zod";
import { readBoundedJson } from "../../packages/edi-contracts/src/json-response";

/** Never generate a commercial installer for an unavailable or misconfigured portal. */
export async function assertPortalReady(portalUrl: string, request: typeof fetch = fetch) {
  const origin = new URL(portalUrl);
  if (origin.protocol !== "https:" || origin.origin !== portalUrl)
    throw new Error("Release portal must be a canonical HTTPS origin");
  const response = await request(new URL("/api/ready", origin), {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`Release portal is not ready (${response.status})`);
  }
  z.object({ ok: z.literal(true) }).parse(await readBoundedJson(response, 65536));
}
