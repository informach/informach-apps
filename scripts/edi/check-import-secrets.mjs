import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { EDI_TOOLS } from "../../packages/config/src/edi-tools.ts";
import { collect } from "./import-tools.mjs";

// Report paths only; never echo a potential credential into logs.
const patterns = [
  /sk-ant-api\d+-[A-Za-z0-9_-]{20,}/,
  /sk_live_[A-Za-z0-9]{16,}/,
  /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const flagged = new Set();
function check(path, bytes) {
  if (patterns.some((pattern) => pattern.test(bytes.toString("utf8")))) flagged.add(path);
}
for (const tool of EDI_TOOLS) {
  const root = join("apps", tool.id);
  for (const file of await collect(root))
    check(join(root, file.path), await readFile(join(root, file.path)));
  const archive = JSON.parse(
    gunzipSync(await readFile(`docs/migrations/edi/origins/${tool.id}.json.gz`)).toString("utf8"),
  );
  for (const file of archive.files)
    check(`baseline:${tool.id}/${file.path}`, Buffer.from(file.content, "base64"));
}
if (flagged.size)
  throw new Error(`Potential credentials need review in: ${[...flagged].join(", ")}`);
console.log(
  "Imported trees and original snapshots: no known credential patterns detected. This is a targeted check, not a complete secret audit.",
);
