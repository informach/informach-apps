import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";

const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/@biomejs/biome/bin/biome"),
    "check",
    ...EDI_TOOLS.map((tool) => `apps/${tool.id}`),
    "--reporter=sarif",
    "--max-diagnostics=10000",
  ],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);
if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error(`Biome did not return a valid SARIF report (exit ${result.status}).`);
}
const categories = new Map();
const detailRule = process.argv[2];
for (const diagnostic of report.runs.flatMap((run) => run.results)) {
  if (detailRule && diagnostic.ruleId.includes(detailRule)) {
    const location = diagnostic.locations[0].physicalLocation;
    console.log(
      `${location.artifactLocation.uri}:${location.region?.startLine ?? "file"}\t${diagnostic.message.text}`,
    );
  }
  const key = `${diagnostic.level}: ${diagnostic.ruleId}`;
  const entry = categories.get(key) ?? { count: 0, examples: [] };
  entry.count++;
  if (entry.examples.length < 2) {
    const location = diagnostic.locations[0].physicalLocation;
    entry.examples.push(`${location.artifactLocation.uri}:${location.region?.startLine ?? "file"}`);
  }
  categories.set(key, entry);
}
if (!detailRule)
  for (const [key, entry] of [...categories].sort(
    (left, right) => right[1].count - left[1].count,
  )) {
    console.log(`${entry.count}\t${key}\t${entry.examples.join("; ")}`);
  }
