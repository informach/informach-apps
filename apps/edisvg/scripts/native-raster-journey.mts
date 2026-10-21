import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { tsImport } from "tsx/esm/api";

/** Raster/video export in the shipped Electron renderer: file origin, CSP, the bundled
 * WebCodecs encoders, binary IPC and the native Save/Cancel dialog. The MP4 written to disk is
 * decoded back by Electron's own H.264 decoder from its avcC and samples. */
export async function verifyNativeRasterExport(
  page: Page,
  outputs: { mp4: string; gif: string },
  screenshotPath: string,
  respond: (action: "Save" | "Open" | "Cancel", path: string) => Promise<unknown>,
) {
  const { parseProject, planRasterFrames }: typeof import("../tests/nativeRigFixtures.ts") =
    await tsImport("../tests/nativeRigFixtures.ts", import.meta.url);
  const { decodeGif, findMp4Box, readMp4Boxes }: typeof import("../tests/rasterDecoders.ts") =
    await tsImport("../tests/rasterDecoders.ts", import.meta.url);
  let edits = 0;
  try {
    await page.locator('[data-action="clip-new"]').first().click();
    const creation = page.locator("#clip-dialog");
    await creation.locator('[name="name"]').fill("Raster nativo");
    await creation.locator('[name="fps"]').fill("10");
    await creation.locator('[name="frames"]').fill("10");
    await creation.getByRole("button", { name: "Criar", exact: true }).click();
    edits++;
    const draft = await page.evaluate(() => localStorage.getItem("edisvg-project"));
    if (!draft) throw new Error("Missing authored raster animation");
    const clip = parseProject(JSON.parse(draft)).motion.animations.at(-1);
    assert.ok(clip);
    const frames = planRasterFrames(clip, 10).times.length,
      dialog = page.locator("#export-dialog");
    const exportAs = async (format: "mp4" | "gif", action: "Save" | "Cancel", path: string) => {
      await page.locator('[data-action="export"]').click();
      await dialog.locator(`[name="format"][value="${format}"]`).check();
      await dialog.getByLabel("Largura da exportação", { exact: true }).fill("160");
      await dialog.getByLabel("Confirmar conversão em imagens", { exact: true }).check();
      const timeline = dialog.getByLabel("Confirmar exportação somente da timeline", {
        exact: true,
      });
      if (await timeline.count()) await timeline.check();
      if (format === "gif")
        await dialog.getByLabel("Confirmar paleta do GIF", { exact: true }).check();
      await dialog.locator("#download:not([disabled])").waitFor({ timeout: 20000 });
      if (format === "mp4" && action === "Save") await dialog.screenshot({ path: screenshotPath });
      await dialog.locator("#download").click();
      await respond(action, path);
    };
    await exportAs("mp4", "Save", outputs.mp4);
    await dialog.waitFor({ state: "hidden", timeout: 60000 });
    const mp4 = new Uint8Array(await readFile(outputs.mp4)),
      boxes = readMp4Boxes(mp4),
      stbl = ["moov", "trak", "mdia", "minf", "stbl"],
      stsd = findMp4Box(boxes, [...stbl, "stsd"]),
      stsz = findMp4Box(boxes, [...stbl, "stsz"]),
      stco = findMp4Box(boxes, [...stbl, "stco"]),
      view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
    assert.deepEqual(
      boxes.map((box) => box.type),
      ["ftyp", "moov", "mdat"],
    );
    const count = view.getUint32(stsz.start + 16);
    assert.equal(count, frames);
    // avc1 sample entry: 8 box + 8 stsd header + 8 entry header + 78 visual fields.
    const avcCStart = stsd.start + 16 + 8 + 78,
      avcCSize = view.getUint32(avcCStart);
    assert.equal(String.fromCharCode(...mp4.subarray(avcCStart + 4, avcCStart + 8)), "avcC");
    const description = Array.from(mp4.subarray(avcCStart + 8, avcCStart + avcCSize)),
      samples: number[][] = [];
    let offset = view.getUint32(stco.start + 16);
    for (let index = 0; index < count; index++) {
      const size = view.getUint32(stsz.start + 20 + index * 4);
      samples.push(Array.from(mp4.subarray(offset, offset + size)));
      offset += size;
    }
    const decoded = await page.evaluate(
      async ({ description, samples }) => {
        const profile = description[1] ?? 0,
          compatibility = description[2] ?? 0,
          level = description[3] ?? 0,
          codec = `avc1.${[profile, compatibility, level].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
        let output = 0,
          width = 0,
          failure = "";
        const decoder = new VideoDecoder({
          output(frame) {
            output++;
            width = frame.displayWidth;
            frame.close();
          },
          error(error) {
            failure = error.message;
          },
        });
        decoder.configure({ codec, description: Uint8Array.from(description) });
        for (const [index, data] of samples.entries())
          decoder.decode(
            new EncodedVideoChunk({
              type: index === 0 ? "key" : "delta",
              timestamp: index * 100000,
              data: Uint8Array.from(data),
            }),
          );
        await decoder.flush();
        decoder.close();
        return { output, width, failure, codec };
      },
      { description, samples },
    );
    assert.equal(decoded.failure, "");
    assert.equal(decoded.output, frames);
    assert.equal(decoded.width, 160);
    await exportAs("mp4", "Cancel", outputs.mp4);
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#download")?.disabled,
      undefined,
      {
        timeout: 60000,
      },
    );
    assert.deepEqual(new Uint8Array(await readFile(outputs.mp4)), mp4);
    await dialog.locator("#close-export").click();
    await exportAs("gif", "Save", outputs.gif);
    await dialog.waitFor({ state: "hidden", timeout: 60000 });
    const gif = decodeGif(new Uint8Array(await readFile(outputs.gif)));
    assert.equal(gif.width, 160);
    assert.equal(gif.frames.length, frames);
    assert.equal(await page.evaluate(() => localStorage.getItem("edisvg-project")), draft);
    console.log(
      `Verified native raster exports: MP4 ${decoded.codec} decoded (${frames} frames), GIF and Cancel`,
    );
  } finally {
    const dialog = page.locator("#export-dialog");
    if (await dialog.isVisible()) await dialog.locator("#close-export").click();
    for (let step = 0; step < edits; step++) await page.keyboard.press("Control+z");
  }
}
