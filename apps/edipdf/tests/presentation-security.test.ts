import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";

test("the presentation dependency rejects zero-length ICNS/JXL/HEIF boxes without hanging", () => {
  const require = createRequire(import.meta.url),
    writerRequire = createRequire(require.resolve("pptxgenjs")),
    parser = writerRequire.resolve("image-size");
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    const { imageSize } = require(process.argv[1]);
    function box(type, payload = Buffer.alloc(0), length) {
      const bytes = Buffer.alloc(8 + payload.length);
      bytes.writeUInt32BE(length ?? bytes.length);
      bytes.write(type, 4, 4, 'ascii');
      payload.copy(bytes, 8);
      return bytes;
    }
    const icns = Buffer.alloc(16);
    icns.write('icns', 0, 4, 'ascii');
    icns.writeUInt32BE(icns.length, 4);
    icns.write('ic07', 8, 4, 'ascii');
    const jxl = Buffer.concat([
      box('JXL ', Buffer.from([13, 10, 135, 10])),
      box('ftyp', Buffer.from('jxl ')), box('jxlp', Buffer.alloc(0), 0)
    ]);
    const heif = Buffer.concat([
      box('ftyp', Buffer.from('mif1')),
      box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', Buffer.alloc(0), 0)))]))
    ]);
    for (const [name, bytes] of [['ICNS', icns], ['JXL', jxl], ['HEIF', heif]]) assert.throws(() => imageSize(bytes), name);
    process.stdout.write('rejected: ICNS JXL HEIF');
  `,
      parser,
    ],
    { timeout: 5000, encoding: "utf8", windowsHide: true },
  );
  assert.equal(output, "rejected: ICNS JXL HEIF");
});
