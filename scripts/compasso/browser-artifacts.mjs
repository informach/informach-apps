import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APPS } from "../../packages/config/src/apps.ts";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Each invocation owns only these generated files. Traces/screenshots remain reviewable. */
export async function withBrowserArtifacts(slugs, operation) {
  const id = randomBytes(12).toString("hex");
  const owned = [];
  const failures = [];
  let result;
  try {
    for (const slug of new Set(slugs)) {
      if (!Object.values(APPS).some((app) => app.slug === slug))
        throw new Error("Unregistered test app");
      const app = resolve(workspace, "apps", slug);
      const build = resolve(app, `.next-compasso-${id}`);
      const config = resolve(app, `.compasso-tsconfig-${id}.json`);
      for (const target of [build, config]) {
        if (dirname(target) !== app || !basename(target).includes(id))
          throw new Error("Unexpected isolated build path");
      }
      const nextEnv = resolve(app, "next-env.d.ts");
      let previous = null;
      try {
        previous = await readFile(nextEnv, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await writeFile(
        config,
        JSON.stringify(
          {
            extends: "./tsconfig.json",
            include: [
              "next-env.d.ts",
              "src/**/*.ts",
              "src/**/*.tsx",
              `.next-compasso-${id}/types/**/*.ts`,
              `.next-compasso-${id}/dev/types/**/*.ts`,
            ],
            exclude: ["node_modules"],
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
      owned.push({ build, config, nextEnv, previous });
    }
    result = await operation(id);
  } catch (error) {
    failures.push(error);
  }
  for (const { build, config, nextEnv, previous } of owned.reverse()) {
    try {
      // Do not overwrite a concurrent generator belonging to another invocation.
      let current = null;
      try {
        current = await readFile(nextEnv, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (current?.includes(`.next-compasso-${id}/`)) {
        if (previous === null) await rm(nextEnv);
        else await writeFile(nextEnv, previous);
      }
    } catch (error) {
      failures.push(error);
    }
    for (const target of [config, build]) {
      try {
        await rm(target, {
          recursive: target === build,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch (error) {
        failures.push(error);
      }
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Browser verification or artifact cleanup failed");
  return result;
}
