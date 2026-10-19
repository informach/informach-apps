import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPdf, mergePdfs } from "../../../apps/edipdf/src/shared/build.ts";
import { toWinAnsi } from "../../../apps/edipdf/src/shared/model.ts";

const requirePdf = createRequire(resolve("apps/edipdf/package.json"));
const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFString, decodePDFRawStream } =
  requirePdf("pdf-lib");
const pdfjs = await import(
  pathToFileURL(requirePdf.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href
);
const report = {};
const pageRef = (src, index) => ({ id: `${src}-${index}`, src, index, rotation: 0 });
const empty = (pages) => ({
  pages,
  annots: [],
  forms: {},
  meta: {},
  watermark: null,
  pageNumbers: null,
});
async function texts(bytes) {
  const p = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    standardFontDataUrl: `${resolve("apps/edipdf/node_modules/pdfjs-dist/standard_fonts")}/`,
  }).promise;
  const t = [];
  for (let i = 1; i <= p.numPages; i++)
    t.push(
      (await (await p.getPage(i)).getTextContent()).items
        .filter((x) => "str" in x)
        .map((x) => x.str)
        .join(" "),
    );
  await p.loadingTask.destroy();
  return t;
}
async function sample(labels, field, bookmark = false, sharedWidget = false) {
  const d = await PDFDocument.create();
  for (const l of labels) d.addPage([600, 800]).drawText(l, { x: 50, y: 700, size: 20 });
  if (field) {
    const f = d.getForm().createTextField(field);
    f.setText("Inicial");
    f.addToPage(d.getPage(0), { x: 50, y: 600, width: 200, height: 25 });
    if (sharedWidget) f.addToPage(d.getPage(1), { x: 50, y: 600, width: 200, height: 25 });
  }
  if (bookmark) {
    const outline = d.context.obj({ Type: "Outlines" });
    const r = d.context.register(outline);
    const child = d.context.register(
      d.context.obj({
        Title: PDFString.of("Segredo"),
        Parent: r,
        Dest: [d.getPage(1).ref, PDFName.of("Fit")],
      }),
    );
    outline.set(PDFName.of("First"), child);
    outline.set(PDFName.of("Last"), child);
    outline.set(PDFName.of("Count"), d.context.obj(1));
    d.catalog.set(PDFName.of("Outlines"), r);
  }
  return d.save();
}
function hiddenPages(d) {
  const objects = d.context.enumerateIndirectObjects();
  return {
    visible: d.getPageCount(),
    pageObjects: objects.filter(
      ([, o]) => o instanceof PDFDict && o.get(PDFName.of("Type")) === PDFName.of("Page"),
    ).length,
    secretStreams: objects
      .filter(([, o]) => o instanceof PDFRawStream)
      .map(([, o]) => {
        try {
          return Buffer.from(decodePDFRawStream(o).decode()).toString("latin1");
        } catch {
          return "";
        }
      })
      .filter((s) => s.includes(Buffer.from("SEGREDO_REMOVIDO").toString("hex").toUpperCase()))
      .length,
  };
}
await mkdir(resolve(".cache/edipdf-analysis"), { recursive: true });
const a = await sample(["ORIGINAL_CONFIDENCIAL"]);
const p = pageRef("a", 0);
const c = empty([p]);
c.annots = [
  {
    id: "cover",
    page: p.id,
    kind: "rect",
    x: 49,
    y: 75,
    w: 350,
    h: 35,
    stroke: null,
    fill: "#ffffff",
    width: 0,
  },
  {
    id: "replacement",
    page: p.id,
    kind: "text",
    x: 50,
    y: 75,
    text: "NOVO_TEXTO",
    font: "helvetica",
    size: 20,
    color: "#000000",
  },
];
report.overlay = {
  text: await texts(await buildPdf({ content: c, sources: { a }, primary: "a" })),
};
report.unicode = { input: "Olá Ω 中文 ✓ 😀", saved: toWinAnsi("Olá Ω 中文 ✓ 😀") };
const unicodeContent = empty([p]);
unicodeContent.annots = [
  {
    id: "unicode",
    page: p.id,
    kind: "text",
    x: 50,
    y: 150,
    text: report.unicode.input,
    font: "helvetica",
    size: 20,
    color: "#000000",
  },
];
report.unicode.extracted = await texts(
  await buildPdf({ content: unicodeContent, sources: { a }, primary: "a" }),
);
for (const mode of ["bookmark", "sharedWidget"]) {
  const src = await sample(
    ["PUBLICO", "SEGREDO_REMOVIDO"],
    mode === "sharedWidget" ? "nome" : null,
    mode === "bookmark",
    mode === "sharedWidget",
  );
  const out = await buildPdf({
    content: empty([pageRef("src", 0)]),
    sources: { src },
    primary: "src",
  });
  report[mode] = hiddenPages(await PDFDocument.load(out));
  await writeFile(resolve(`.cache/edipdf-analysis/deleted-${mode}.pdf`), out);
}
const f1 = await sample(["A"], "nome");
const f2 = await sample(["B"], "empresa");
const combined = await buildPdf({
  content: empty([pageRef("a", 0), pageRef("b", 0)]),
  sources: { a: f1, b: f2 },
  primary: "a",
});
const cd = await PDFDocument.load(combined);
report.foreignForms = {
  fields: cd
    .getForm()
    .getFields()
    .map((f) => f.getName()),
  secondPageWidgets: cd.getPage(1).node.Annots()?.size(),
};
const merged = await PDFDocument.load(await mergePdfs([f1, f2]));
report.directMergeForms = {
  fields: merged
    .getForm()
    .getFields()
    .map((f) => f.getName()),
};
const fd = await PDFDocument.create();
fd.addPage([600, 800]).drawText("ORIGINAL_CONFIDENCIAL", { x: 50, y: 700, size: 20 });
fd.addPage([600, 800]).drawText("SEGUNDA_PAGINA", { x: 50, y: 700, size: 20 });
fd.getForm()
  .createTextField("nome")
  .addToPage(fd.getPage(0), { x: 50, y: 600, width: 200, height: 25 });
fd.getPage(0).node.addAnnot(
  fd.context.register(
    fd.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [300, 600, 320, 620],
      Contents: PDFString.of("COMENTARIO_EXISTENTE"),
      Name: "Comment",
    }),
  ),
);
fd.getPage(0).node.addAnnot(
  fd.context.register(
    fd.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [50, 550, 200, 570],
      A: { S: "URI", URI: PDFString.of("https://example.com") },
    }),
  ),
);
await writeFile(resolve(".cache/edipdf-analysis/audit.pdf"), await fd.save());
await writeFile(
  resolve(".cache/edipdf-analysis/probe-results.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
