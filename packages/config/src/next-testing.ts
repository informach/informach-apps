/** Browser fixtures must not reuse a developer's build cache or change its TypeScript config. */
export function isolatedNextOptions(environment: Record<string, string | undefined> = process.env) {
  const id = environment.COMPASSO_TEST_RUN_ID;
  if (!id) return {};
  if (!/^[a-f0-9]{24}$/.test(id) || environment.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Invalid isolated Compasso build context");
  const database = new URL(environment.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
    throw new Error("Compasso browser fixtures require a disposable local database");
  return {
    distDir: `.next-compasso-${id}`,
    typescript: { tsconfigPath: `.compasso-tsconfig-${id}.json` },
  };
}
