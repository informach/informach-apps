import assert from "node:assert/strict";
import { basename, dirname, isAbsolute, join } from "node:path";
import { writeUnique } from "../../src/main/files.ts";

const directory = process.argv[2],
  number = process.argv[3];
assert.ok(directory && isAbsolute(directory));
assert.equal(dirname(directory), process.cwd());
assert.match(basename(directory), /^\.file-test-[a-zA-Z\d]+$/);
assert.ok(number && /^[0-3]$/.test(number));
const path = await writeUnique(
  join(directory, "ação αβγ (cópia).pdf"),
  new TextEncoder().encode(`conteúdo ${number}`),
);
process.stdout.write(JSON.stringify(path));
