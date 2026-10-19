import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { presentationSchema } from "../src/shared/presentation/format.ts";
import { exportOdp } from "../src/shared/presentation/odp-export.ts";
import { exportPptx } from "../src/shared/presentation/pptx-export.ts";
import { preparePresentation } from "../src/shared/presentation/render.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)),
  directory = resolve(root, ".cache/edipdf-analysis/presentation-export");
await mkdir(directory, { recursive: true });
const [regular, bold, italic, boldItalic, license, picture] = await Promise.all([
  readFile(new URL("../resources/fonts/NotoSans-Regular.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-Bold.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-Italic.ttf", import.meta.url)),
  readFile(new URL("../resources/fonts/NotoSans-BoldItalic.ttf", import.meta.url)),
  readFile(new URL("../resources/licenses/Noto-OFL.txt", import.meta.url), "utf8"),
  readFile(new URL("../tests/fixtures/tiff/rgb-raw-1.png", import.meta.url)),
]);
const fonts = { regular, bold, italic, boldItalic },
  document = presentationSchema.parse({
    title: "Apresentação local αβγ",
    width: 720,
    height: 405,
    warnings: [],
    slides: [
      {
        name: "Primeiro",
        elements: [
          {
            kind: "shape",
            id: "rectangle",
            box: { x: 30, y: 30, w: 660, h: 80 },
            shape: "rect",
            fill: "#eeeeff",
            stroke: "#123456",
          },
          {
            kind: "shape",
            id: "ellipse",
            box: { x: 500, y: 250, w: 100, h: 60 },
            shape: "ellipse",
            fill: "#21a8e3",
            stroke: "#123456",
            rotation: 15,
            opacity: 0.5,
          },
          {
            kind: "shape",
            id: "line",
            box: { x: 500, y: 340, w: 100, h: 1 },
            shape: "line",
            stroke: "#123456",
          },
          {
            kind: "text",
            id: "title",
            box: { x: 40, y: 40, w: 630, h: 60 },
            paragraphs: [
              {
                kind: "paragraph",
                align: "center",
                runs: [{ text: "AÇÃO_LOCAL_αβγ", bold: true, size: 24, color: "#264a73" }],
              },
            ],
          },
          {
            kind: "text",
            id: "body",
            box: { x: 300, y: 150, w: 350, h: 80 },
            paragraphs: [
              {
                kind: "paragraph",
                runs: [
                  {
                    text: "Texto editável; café e informação.\nSegunda linha.",
                    italic: true,
                    size: 16,
                  },
                ],
              },
            ],
          },
          {
            kind: "image",
            id: "picture",
            box: { x: 40, y: 150, w: 200, h: 150 },
            bytes: new Uint8Array(picture),
            format: "png",
            alt: "Imagem local",
          },
        ],
      },
      {
        name: "Segundo",
        elements: [
          {
            kind: "text",
            id: "last",
            box: { x: 40, y: 40, w: 630, h: 80 },
            paragraphs: [{ kind: "paragraph", runs: [{ text: "ULTIMO_SLIDE", size: 20 }] }],
          },
        ],
      },
    ],
  });
const prepared = await preparePresentation(document, fonts);
await writeFile(join(directory, "preview.pdf"), prepared.pdf);
await writeFile(join(directory, "exported.pptx"), (await exportPptx(prepared)).bytes);
await writeFile(join(directory, "exported.odp"), exportOdp(prepared, fonts, license));
execFileSync(
  "python",
  [
    fileURLToPath(new URL("./validate-open-document.py", import.meta.url)),
    join(directory, "exported.odp"),
  ],
  { stdio: "inherit", cwd: root, windowsHide: true },
);
execFileSync(
  "python",
  [fileURLToPath(new URL("./validate-presentation.py", import.meta.url)), directory],
  { stdio: "inherit", cwd: root, windowsHide: true },
);
