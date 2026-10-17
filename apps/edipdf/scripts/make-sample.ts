// Writes tests/fixtures/sample.pdf: text pages, a fillable form and a rotated page, for manual and automated checks.
import { writeFileSync } from "node:fs";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

const doc = await PDFDocument.create();
doc.setTitle("Contrato de exemplo");
const font = await doc.embedFont(StandardFonts.TimesRoman);
const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
const sans = await doc.embedFont(StandardFonts.Helvetica);
const para =
  "Pelo presente instrumento particular, as partes abaixo qualificadas têm entre si justo e contratado o seguinte, que mutuamente aceitam e outorgam.";
for (let n = 1; n <= 3; n++) {
  const page = doc.addPage([595.28, 841.89]);
  page.drawText(n === 1 ? "Contrato de Prestação de Serviços" : `Cláusula ${n}`, {
    x: 72,
    y: 760,
    size: 20,
    font: bold,
  });
  let y = 720;
  for (let i = 0; i < 18; i++) {
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      if (font.widthOfTextAtSize(line + w, 12) > 450) {
        page.drawText(line.trim(), { x: 72, y, size: 12, font });
        y -= 17;
        line = "";
      }
      line += w + " ";
    }
    page.drawText(line.trim(), { x: 72, y, size: 12, font });
    y -= 26;
    if (y < 90) break;
  }
  page.drawText(`Página ${n}`, { x: 280, y: 40, size: 9, font: sans, color: rgb(0.4, 0.4, 0.4) });
}
const formPage = doc.addPage([595.28, 841.89]);
formPage.drawText("Ficha de cadastro", { x: 72, y: 760, size: 20, font: bold });
const form = doc.getForm();
const labels = ["Nome completo", "E-mail", "Cidade"];
labels.forEach((l, i) => {
  formPage.drawText(l, { x: 72, y: 712 - i * 50, size: 11, font: sans });
  form
    .createTextField(`campo_${i}`)
    .addToPage(formPage, { x: 72, y: 688 - i * 50, width: 300, height: 20 });
});
formPage.drawText("Aceito os termos", { x: 96, y: 545, size: 11, font: sans });
form.createCheckBox("aceito").addToPage(formPage, { x: 72, y: 542, width: 14, height: 14 });
const plan = form.createRadioGroup("plano");
["Mensal", "Anual"].forEach((p, i) => {
  formPage.drawText(p, { x: 96 + i * 100, y: 505, size: 11, font: sans });
  plan.addOptionToPage(p, formPage, { x: 72 + i * 100, y: 502, width: 14, height: 14 });
});
const uf = form.createDropdown("estado");
uf.addOptions(["SP", "RJ", "MG", "RS"]);
formPage.drawText("Estado", { x: 72, y: 470, size: 11, font: sans });
uf.addToPage(formPage, { x: 72, y: 444, width: 120, height: 20 });
const land = doc.addPage([595.28, 841.89]);
land.drawText("Anexo em paisagem (página com /Rotate 90)", { x: 72, y: 760, size: 18, font: bold });
land.setRotation(degrees(90));
writeFileSync("tests/fixtures/sample.pdf", await doc.save());
console.log("ok");
