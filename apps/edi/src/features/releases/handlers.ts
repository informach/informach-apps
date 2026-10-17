import { channelSchema } from "@informach/edi-contracts";
import { logger } from "../../lib/logger";
import { getReleases } from "../../lib/releases";
export async function releaseCatalog(channel: string) {
  const parsed = channelSchema.safeParse(channel);
  if (!parsed.success) return Response.json({ error: "invalid_channel" }, { status: 400 });
  try {
    const manifest = await getReleases().active(parsed.data);
    return manifest
      ? Response.json(manifest, {
          headers: { "Cache-Control": "public, max-age=60, must-revalidate" },
        })
      : Response.json({ error: "no_release" }, { status: 404 });
  } catch (error) {
    logger.warn(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "release.catalog_unavailable",
    );
    return Response.json(
      { error: "catalog_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
