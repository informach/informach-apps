import { z } from "zod";

const metadataSchema = z.object({
  openrouter: z
    .object({
      usage: z
        .object({
          cost: z.number().nonnegative().optional(),
          server_tool_use: z
            .object({ web_search_requests: z.number().int().nonnegative() })
            .optional(),
        })
        .optional(),
      provider: z.string().optional(),
    })
    .optional(),
});

/** Actual provider-reported USD only; absent is unknown, never zero or an invented estimate. */
export function providerCostMetadata(input: unknown, usage?: unknown): Record<string, unknown> {
  const provider = metadataSchema.safeParse(input).data?.openrouter;
  // Mastra wraps the gateway's raw usage twice instead of exposing providerMetadata.
  // Read only its reported cost, never store the raw payload or derive a token estimate.
  const mastraCost = z
    .object({ raw: z.object({ raw: z.object({ cost: z.number().finite().nonnegative() }) }) })
    .safeParse(usage).data?.raw.raw.cost;
  const cost = provider?.usage?.cost ?? mastraCost;
  return {
    ...(cost !== undefined ? { providerCostUsd: cost } : {}),
    ...(provider?.provider ? { provider: provider.provider } : {}),
    ...(provider?.usage?.server_tool_use
      ? { webSearchRequests: provider.usage.server_tool_use.web_search_requests }
      : {}),
  };
}
