import sharp from "sharp";
import { expect, it } from "vitest";
import { InvalidVisionImageError, prepareVisionImage } from "../vision-image";

it("decodes a wide image to one bounded JPEG and strips private metadata", async () => {
  const source = await sharp({
    create: { width: 4000, height: 20, channels: 3, background: "red" },
  })
    .withExif({ IFD0: { Artist: "private fixture" } })
    .jpeg()
    .toBuffer();
  const result = await prepareVisionImage(`data:image/jpeg;base64,${source.toString("base64")}`);
  const info = await sharp(Buffer.from(result.split(",")[1] ?? "", "base64")).metadata();
  expect(info).toMatchObject({ format: "jpeg", width: 1280, height: 1280 });
  expect(info.exif).toBeUndefined();
});
it("refuses spoofed MIME, malformed bytes, URLs and oversized decoded images", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  for (const input of [
    "https://example.invalid/image.png",
    "data:image/png;base64,aGVsbG8=",
    `data:image/jpeg;base64,${png.toString("base64")}`,
  ])
    await expect(prepareVisionImage(input)).rejects.toBeInstanceOf(InvalidVisionImageError);
  const large = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(
    prepareVisionImage(`data:image/png;base64,${large.toString("base64")}`),
  ).rejects.toBeInstanceOf(InvalidVisionImageError);
});
