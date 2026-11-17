import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Arte e capturas licenciadas nunca entram no checkout público, nem no CI. */
const solicitada = process.env.MORADA_E2E_EVIDENCIAS;
export const evidenciasPrivadas = solicitada ? realpathSync(solicitada) : null;
if (evidenciasPrivadas) {
  const raiz = realpathSync(fileURLToPath(new URL("../../..", import.meta.url)));
  const caminho = relative(raiz, evidenciasPrivadas);
  const fora = caminho === ".." || caminho.startsWith(`..${sep}`) || isAbsolute(caminho);
  if (!fora) throw new Error("Evidências com arte devem ficar fora do checkout público.");
}
if ((process.env.MORADA_ARTE_DIR || process.env.MORADA_E2E_ARTE === "1") && !evidenciasPrivadas)
  throw new Error("A prova com arte exige um diretório privado de evidências.");
