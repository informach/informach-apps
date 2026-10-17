// Downloads the bundled fonts (all SIL Open Font License, from Google Fonts) as static TTF files
// into resources/fonts, with resources/fonts.json listing them. TTF because libass (burned captions) needs it.
// Run with: node scripts/fetch-fonts.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FAMILIES = [
  ["Plus Jakarta Sans", [400, 600, 700, 800], "Padrão"],
  ["Inter", [400, 600, 700, 800], "Limpa"],
  ["Nunito", [400, 600, 700, 800, 900], "Arredondada"],
  ["Fredoka", [400, 600, 700], "Infantil"],
  ["Baloo 2", [400, 600, 700, 800], "Infantil"],
  ["Poppins", [400, 600, 700, 800], "Geométrica"],
  ["Montserrat", [400, 600, 700, 800], "Geométrica"],
  ["Lilita One", [400], "Títulos"],
  ["Bebas Neue", [400], "Títulos"],
  ["Bangers", [400], "Quadrinhos"],
  ["Comic Neue", [400, 700], "Quadrinhos"],
  ["Patrick Hand", [400], "Escrita à mão"],
];

const dir = join(import.meta.dirname, "..", "resources", "fonts");
mkdirSync(dir, { recursive: true });
const manifest = [];
for (const [family, weights, group] of FAMILIES) {
  // An old user agent makes Google Fonts answer with plain TTF files.
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(";")}`,
      { headers: { "User-Agent": "Mozilla/4.0" } },
    )
  ).text();
  const faces = [...css.matchAll(/font-weight: (\d+);[\s\S]*?url\((https:[^)]+\.ttf)\)/g)];
  if (!faces.length) throw new Error(`${family}: no TTF in the answer`);
  const files = [];
  for (const [, weight, url] of faces) {
    const file = `${family.replace(/\s+/g, "")}-${weight}.ttf`;
    writeFileSync(join(dir, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
    files.push({ weight: Number(weight), file });
  }
  manifest.push({ family, group, files });
  console.log(family, files.map((f) => f.weight).join(" "));
}
writeFileSync(join(dir, "..", "fonts.json"), JSON.stringify(manifest, null, 2));
