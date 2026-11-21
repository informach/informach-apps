import { z } from "zod";

/** This operator process accepts no browser authority or source credentials in
 * argv. The production database URL remains inside its Railway service. */
export function configuracaoDaConciliacaoDeRastros(
  input: Readonly<Record<string, string | undefined>>,
) {
  const modo = input.RECREIO_WORLD_TRACE_RECONCILIATION_MODE;
  if (modo === undefined || modo === "off") return null;
  const config = z
    .strictObject({
      modo: z.enum(["inspect", "apply"]),
      projeto: z.literal("f4da4285-5b98-48b5-b03e-5be02f4e7c56"),
      ambiente: z.literal("174b2cb0-e1cd-410c-8764-d913e3af18d3"),
      servico: z.uuid(),
      fonte: z.string().regex(/^[a-f0-9]{40}$/),
      conexao: z.url(),
    })
    .parse({
      modo,
      projeto: input.RAILWAY_PROJECT_ID,
      ambiente: input.RAILWAY_ENVIRONMENT_ID,
      servico: input.RAILWAY_SERVICE_ID,
      fonte: input.RAILWAY_GIT_COMMIT_SHA,
      conexao: input.DATABASE_URL,
    });
  const url = new URL(config.conexao);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".railway.internal") ||
    !url.username ||
    !url.password ||
    url.searchParams.get("sslmode") !== "require"
  )
    throw new Error("Invalid world trace reconciliation environment");
  return config;
}
