import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { decryptBackup, dpapi } from "./protected-keys.mjs";

const { values } = parseArgs({
  options: {
    backup: { type: "string" },
    identity: { type: "string" },
    restore: { type: "boolean", default: false },
  },
});
if (!values.backup || !values.identity)
  throw new Error(
    "Use --backup <keys.age> --identity <recovery identity>; --restore writes a new local DPAPI copy",
  );
const keys = decryptBackup(await readFile(values.backup), values.identity);
if (values.restore) {
  const target = resolve(".cache/edi-configuration/keys.v1.dpapi");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, dpapi(JSON.stringify(keys)), { flag: "wx", mode: 0o600 });
}
console.log(
  `Portable recovery verified: ${keys.update.id}; ${keys.license.id}. ${values.restore ? "Local DPAPI copy created." : "No files modified."}`,
);
