import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DOCUMENTOS = new Set([
  "docs/estado-do-repositorio.md",
  "docs/audit-payload-policy.md",
  "apps/recreio/PRODUCAO.md",
]);

/** A decisão usa o diff Git completo, sem o limite de 300 arquivos dos filtros de evento. */
export function exigePipelineCompleto(arquivos) {
  return arquivos.some(
    (arquivo) =>
      !DOCUMENTOS.has(arquivo) &&
      !(
        /^docs\/recreio\/(?:[^/]+\.md|evidencias\/[^/]+\.json)$/.test(arquivo) &&
        !arquivo.includes("\ufffd")
      ),
  );
}

export function arquivosAlterados(antes, depois, cwd = process.cwd()) {
  if (![antes, depois].every((sha) => /^[a-f0-9]{40}$/i.test(sha)))
    throw new Error("Referência Git inválida para classificar a alteração");
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", antes, depois], { cwd })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function garantirCommit(sha) {
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("Referência Git inválida");
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
  } catch {
    execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", sha], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  }
}

function principal() {
  if (process.argv.length !== 5) throw new Error("Argumentos do classificador ausentes");
  const [evento, eventoPath, depois] = process.argv.slice(2);
  let completo = true;
  if (evento === "push" || evento === "pull_request") {
    if (!eventoPath) throw new Error("Evento do GitHub ausente");
    const dados = JSON.parse(readFileSync(eventoPath, "utf8"));
    const antes = evento === "push" ? dados.before : dados.pull_request?.base?.sha;
    // Primeira publicação e execução manual exigem o pipeline completo.
    if (antes !== "0".repeat(40)) {
      if (typeof antes !== "string" || typeof depois !== "string")
        throw new Error("Referências do evento ausentes");
      garantirCommit(antes);
      garantirCommit(depois);
      completo = exigePipelineCompleto(arquivosAlterados(antes, depois));
    }
  }
  console.log(`completo=${completo}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
