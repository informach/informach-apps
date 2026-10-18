import { z } from "zod";
import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { Project } from "../../../shared/project";
import { xmlEscape } from "../../../shared/scene.js";

const optionsSchema = z.strictObject({
  format: z.literal("interactive-html"),
  alt: z.string().trim().min(1).max(200),
  reduced: z.boolean(),
  offscreen: z.boolean(),
  artboardId: z.string().max(120).nullable().optional(),
  machineId: z.string().max(120).nullable().optional(),
  animationId: z.string().max(120).nullable().optional(),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
  confirmAnimationOnly: z.boolean().optional(),
});
export function buildInteractiveExport(
  project: Project,
  rawOptions: unknown,
  runtimeSource: string,
) {
  const options = optionsSchema.parse(rawOptions),
    boardId = options.artboardId ?? project.defaultArtboardId;
  if (!boardId) throw new Error("Selecione uma prancheta.");
  const compiled = compileInteractiveArtboard(project, boardId, {
      ...(!project.artboards.find((board) => board.id === boardId)?.behavior?.machines.length &&
      options.animationId
        ? { animationId: options.animationId }
        : {}),
    }),
    machineId = options.machineId || compiled.document.behavior.defaultMachineId;
  if (
    compiled.document.behavior.machines.length > 0 &&
    !compiled.document.behavior.machines.some((machine) => machine.id === machineId)
  )
    throw new Error("Escolha uma máquina inicial válida.");
  if (!runtimeSource.includes("mountInteractivePlayer"))
    throw new Error("Bundle interativo offline indisponível.");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${compiled.scene.viewBox.join(" ")}" preserveAspectRatio="${options.fit === "stretch" ? "none" : options.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}" aria-label="${xmlEscape(options.alt)}"><title>${xmlEscape(options.alt)}</title></svg>`;
  const data = JSON.stringify(compiled.document).replace(/</g, "\\u003c"),
    settings = JSON.stringify({
      ...(machineId ? { machineId } : {}),
      respectReducedMotion: options.reduced,
      pauseOffscreen: options.offscreen,
    });
  const content = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlEscape(project.name)} — EdiSVG</title><style>body{margin:0;padding:24px;background:#f2efe8;color:#14213d;font:14px system-ui}main{max-width:920px;margin:auto}#edi-artwork{width:100%;height:60vh;background:white}#edi-artwork>svg{display:block;width:100%;height:100%}button,input,select,textarea{font:inherit;padding:8px}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,svg [tabindex]:focus-visible{outline:2px solid #3946b5;outline-offset:2px}#player-inputs{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;margin-top:16px;max-height:40vh;overflow:auto}textarea{min-width:0}#player-status{color:#9c2424}</style></head><body><main><div id="edi-artwork">${svg}</div><p><button id="play-toggle" type="button">Pausar</button> <button id="player-reset" type="button">Resetar interação</button></p><fieldset id="player-inputs"><legend>Inputs da animação</legend></fieldset><p id="player-status" role="status"></p></main><script id="edi-blueprint" type="application/json">${data}</script><script>${runtimeSource.replace(/<\/script/gi, "<\\/script")}\nEdiSVGRuntime.mountInteractivePlayer(JSON.parse(document.getElementById("edi-blueprint").textContent),${settings}).catch(function(error){document.getElementById("player-status").textContent=error instanceof Error?error.message:"Falha ao iniciar o player.";});</script></body></html>`;
  if (new TextEncoder().encode(content).byteLength > 10000000)
    throw new Error("HTML interativo excede 10 MB. Reduza os recursos antes de exportar.");
  return { extension: "html", type: "text/html", content };
}
