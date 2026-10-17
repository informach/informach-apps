import "server-only";
import { channelSchema, githubRepositorySchema } from "@informach/edi-contracts";
import { fetchPublicRelease } from "@informach/edi-releases";
import { z } from "zod";

const publicConfig = z.object({
  EDI_DISTRIBUTION_REPOSITORY: githubRepositorySchema.default("informach/edi-releases"),
  EDI_UPDATE_PUBLIC_KEYS: z.string().default("{}"),
});
export function getReleases() {
  const config = publicConfig.parse(process.env);
  const trustedKeys = z
    .record(z.string(), z.string())
    .parse(JSON.parse(config.EDI_UPDATE_PUBLIC_KEYS));
  return {
    active: (channel: unknown) =>
      fetchPublicRelease({
        repository: config.EDI_DISTRIBUTION_REPOSITORY,
        trustedKeys,
        channel: channelSchema.parse(channel),
      }),
  };
}
