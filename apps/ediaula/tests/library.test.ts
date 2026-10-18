import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listLibrary, readLibrary, saveLibrary } from "../src/main/library.ts";
import { EMPTY_LIBRARY, type Library, plainStyle } from "../src/shared/library.ts";

const dir = mkdtempSync(join(tmpdir(), "ediaula-lib-"));
const file = join(dir, "library.json");
const logo = join(dir, "logo.png");
writeFileSync(logo, "png");

test("the library keeps only media the app could read, and lists them readable again", async () => {
  const readable = new Set([logo.toLowerCase()]);
  const granted: string[] = [];
  const access = {
    canRead: async (p: string) => readable.has(p.toLowerCase()),
    grantRead: async (p: string) => {
      granted.push(p);
    },
  };
  assert.deepEqual(await readLibrary(file), EMPTY_LIBRARY);
  const library: Library = {
    version: 1,
    media: [{ id: "m1", name: "Logo", path: logo, kind: "image", category: "logo", addedAt: 1 }],
    styles: [
      {
        id: "s1",
        name: "Balão do curso",
        target: "annotation",
        kind: "balloon",
        value: plainStyle({
          color: "#3D6BFF",
          outline: { color: "#000000", width: 2 },
          path: undefined,
        }),
        addedAt: 2,
      },
    ],
  };
  await saveLibrary(file, library, access);
  // A file nobody opened in a lesson is refused.
  await assert.rejects(
    saveLibrary(
      file,
      {
        ...library,
        media: [
          ...library.media,
          {
            id: "m2",
            name: "Outro",
            path: join(dir, "x.png"),
            kind: "image",
            category: "logo",
            addedAt: 3,
          },
        ],
      },
      access,
    ),
    /Abra Outro numa aula/,
  );
  // Listing in a new session: the media still there become readable.
  readable.clear();
  const listed = await listLibrary(file, access);
  assert.deepEqual(granted, [logo]);
  assert.equal(listed.media[0].missing, undefined);
  assert.deepEqual(listed.styles[0].value, {
    color: "#3D6BFF",
    outline: { color: "#000000", width: 2 },
  });
  rmSync(logo);
  const gone = await listLibrary(file, access);
  assert.equal(gone.media[0].missing, true);
});
