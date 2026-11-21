import { z } from "zod";

/** One context policy for encrypted archives and the rights ledger. CI flags
 * cannot turn a Railway process into a qualification destination; production
 * custody is never admitted in a GitHub runner, even with copied metadata. */
export function contextoDeCustodiaPrivadaPermitido(
  input: Readonly<Record<string, string | undefined>>,
  scope: "production" | "qualification",
) {
  if (scope === "qualification")
    return (
      input.CI === "true" &&
      input.GITHUB_ACTIONS === "true" &&
      input.GITHUB_REPOSITORY === "informach/informach-apps" &&
      [input.RAILWAY_PROJECT_ID, input.RAILWAY_ENVIRONMENT_ID, input.RAILWAY_SERVICE_ID].every(
        (v) => v === undefined,
      )
    );
  return (
    input.GITHUB_ACTIONS !== "true" &&
    input.RAILWAY_PROJECT_ID === "f4da4285-5b98-48b5-b03e-5be02f4e7c56" &&
    input.RAILWAY_ENVIRONMENT_ID === "174b2cb0-e1cd-410c-8764-d913e3af18d3" &&
    z.uuid().safeParse(input.RAILWAY_SERVICE_ID).success
  );
}
