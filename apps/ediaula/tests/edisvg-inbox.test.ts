import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { markPlaced, readReceived } from "../src/main/edisvgInbox.ts";

let userData = "";
before(async () => {
  userData = await mkdtemp(join(tmpdir(), "ediaula-recebidos-"));
});
after(async () => {
  await rm(userData, { recursive: true, force: true });
});

/** A send as EdiSVG writes it (apps/edisvg/src/main/lessonDelivery.ts): videos, then envio.json. */
async function send(lessonId: string, sentAt: number, files: string[], manifestId = lessonId) {
  const folder = join(userData, "recebidos", lessonId);
  await mkdir(folder, { recursive: true });
  for (const file of files) await writeFile(join(folder, file), "video");
  await writeFile(
    join(folder, "envio.json"),
    JSON.stringify({
      version: 1,
      lessonId: manifestId,
      sentAt,
      items: files.map((file, i) => ({
        clipId: file.replace(/-\d{13}\.(mp4|webm)$/, ""),
        kind: file.endsWith(".webm") ? "screen-demo" : "game-scene",
        file,
        name: `Animação ${i + 1}`,
        start: 10 + i * 60,
        duration: 20,
        section: 5,
      })),
    }),
  );
  return folder;
}

test("the newest send for the lesson (or the one it was unpacked from) is offered, with its videos", async () => {
  const folder = await send("pgte1jhfsnary", 1_731_000_000_000, [
    "animation-cena-1731000000000.mp4",
    "animation-demo-1731000000000.webm",
  ]);
  await send("pnova1234abcd", 1_730_000_000_000, ["animation-velha-1730000000000.mp4"]);
  const received = await readReceived(userData, ["pnova1234abcd", "pgte1jhfsnary"]);
  assert.equal(received?.lessonId, "pgte1jhfsnary");
  assert.deepEqual(
    received?.items.map((i) => [i.clipId, i.kind, i.path, i.start]),
    [
      ["animation-cena", "game-scene", join(folder, "animation-cena-1731000000000.mp4"), 10],
      ["animation-demo", "screen-demo", join(folder, "animation-demo-1731000000000.webm"), 70],
    ],
  );
  // Put in (or declined): not offered again; the older send of the other id is.
  await markPlaced(userData, "pgte1jhfsnary", 1_731_000_000_000);
  assert.deepEqual(JSON.parse(await readFile(join(folder, "colocado.json"), "utf8")), {
    sentAt: 1_731_000_000_000,
  });
  assert.equal((await readReceived(userData, ["pgte1jhfsnary"])) ?? null, null);
  assert.equal(
    (await readReceived(userData, ["pnova1234abcd", "pgte1jhfsnary"]))?.lessonId,
    "pnova1234abcd",
  );
  // A newer send of the same lesson is offered again.
  await send("pgte1jhfsnary", 1_731_000_500_000, ["animation-demo-1731000500000.webm"]);
  assert.equal((await readReceived(userData, ["pgte1jhfsnary"]))?.sentAt, 1_731_000_500_000);
});

test("a send whose video is missing, or that names another lesson, is not offered; ids are checked", async () => {
  const folder = await send("pfalta", 1_731_000_000_000, ["animation-a-1731000000000.mp4"]);
  await rm(join(folder, "animation-a-1731000000000.mp4"));
  assert.equal(await readReceived(userData, ["pfalta"]), null);
  await send("poutra", 1_731_000_000_000, ["animation-b-1731000000000.mp4"], "pdiferente");
  assert.equal(await readReceived(userData, ["poutra"]), null);
  assert.equal(await readReceived(userData, ["pnada"]), null);
  await assert.rejects(readReceived(userData, ["../fora"]));
  await assert.rejects(readReceived(userData, []));
  await assert.rejects(markPlaced(userData, "../fora", 1));
});
