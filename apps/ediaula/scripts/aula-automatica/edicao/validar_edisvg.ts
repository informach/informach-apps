// Confere as peças com o leitor do próprio EdiSVG (parseProject), antes de vincular: uma peça que ele recusa nunca
// vira render, e a edição esperava à toa (Cadê A1P4, 27/11/2026: "Trilha referencia um objeto inexistente" e "ID de
// animação/trilha/chave duplicado" no Zappy; e "Runtime excede orçamento agregado de deformação/geometria", que só
// aparece no render). Uso (de apps/edisvg): tsx <este arquivo> <peça.edisvg> ...
import { readFileSync } from "node:fs";
import { compileArtboard } from "../../../../edisvg/src/shared/components.ts";
import { parseProject } from "../../../../edisvg/src/shared/project.ts";

let ruins = 0;
for (const f of process.argv.slice(2)) {
  try {
    const p = parseProject(JSON.parse(readFileSync(f, "utf8")));
    // A cena montada como no render (componentes expandidos): pega o orçamento de deformações e de geometria
    // ("Runtime excede orçamento agregado", o Zappy duas vezes na mesma cena).
    compileArtboard(p, p.defaultArtboardId, {});
  } catch (e) {
    ruins++;
    console.log(`${f.split(/[/]/).pop()}: o EdiSVG recusa (${(e as Error).message.slice(0, 300)})`);
  }
}
console.log(
  ruins
    ? `${ruins} peça(s) recusada(s) pelo EdiSVG`
    : `ok (${process.argv.length - 2} peças abrem no EdiSVG)`,
);
process.exit(ruins ? 1 : 0);
