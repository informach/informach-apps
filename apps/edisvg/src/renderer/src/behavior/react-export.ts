import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { compileInteractiveArtboard } from "../../../shared/interactive";
import type { Project } from "../../../shared/project";
import { nextExample } from "./next-example";
import { reactArtifactDeclaration } from "./react-artifact-contract";

const schema = z.strictObject({
  format: z.literal("react"),
  alt: z.string().trim().min(1).max(200),
  reduced: z.boolean(),
  offscreen: z.boolean(),
  artboardId: z.string().max(120).nullable().optional(),
  animationId: z.string().max(120).nullable().optional(),
  machineId: z.string().max(120).nullable().optional(),
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
  confirmAnimationOnly: z.boolean().optional(),
});
const literal = (value: unknown) => {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error("Literal React não serializável.");
  return text.replace(/</g, "\\u003c");
};
export function buildReactExport(
  project: Project,
  raw: unknown,
  runtime: string,
  licenses: string,
) {
  const options = schema.parse(raw, { jitless: true }),
    boardId = options.artboardId ?? project.defaultArtboardId;
  if (!boardId) throw new Error("Selecione uma prancheta para React.");
  if (
    !runtime.startsWith('"use client";') ||
    !runtime.includes("EdiSvgPlayer") ||
    !runtime.includes("VisualArtwork") ||
    !licenses.includes("MIT License")
  )
    throw new Error("Runtime React/licenças indisponíveis.");
  const compiled = compileInteractiveArtboard(project, boardId, {
      ...(!project.artboards.find((board) => board.id === boardId)?.behavior?.machines.length &&
      options.animationId
        ? { animationId: options.animationId }
        : {}),
    }),
    machineId = options.machineId || compiled.document.behavior.defaultMachineId;
  if (machineId && !compiled.document.behavior.machines.some((value) => value.id === machineId))
    throw new Error("Máquina React inválida.");
  const geometry = "h(VisualArtwork,{document:blueprint})";
  const component = `"use client";\nimport {createElement as h} from "react";\nimport {EdiSvgPlayer,VisualArtwork} from "./edi-react-player.mjs";\nconst blueprint=${literal(compiled.document)};\nconst artwork=${geometry};\nexport function EdiAnimation({title=${literal(options.alt)},...props}={}){return h(EdiSvgPlayer,{machineId:${machineId ? literal(machineId) : "undefined"},fit:${literal(options.fit)},respectReducedMotion:${options.reduced},pauseOffscreen:${options.offscreen},...props,document:blueprint,viewBox:${literal(compiled.scene.viewBox.join(" "))},title},artwork);}\nexport default EdiAnimation;\n`;
  const readme = `# Animação EdiSVG para React\n\nCopie os arquivos juntos para o seu app React 19.3.1+ (React DOM correspondente). Não precisa instalar @informach/edi-motion, Zod, Yoga, Electron ou a suíte; o runtime e WASM já estão locais. React continua externo e usa a instalação do host.\n\n\`\`\`jsx\nimport EdiAnimation from "./EdiAnimation.jsx";\n<EdiAnimation title="Animação" style={{width: 400, height: 240}} inputValues={{}} />\n\`\`\`\n\nO componente e o runtime começam com use client para Next.js. NextExample.tsx demonstra uma fronteira cliente com ref/callbacks: copie os seis arquivos juntos para app/animation e importe NextExample de ./animation/NextExample na página de servidor; não passe callbacks do servidor para o cliente. Não precisa de ssr:false nem de suppressHydrationWarning. Há declarações TypeScript ao lado do JSX. Defina CSS dimensionando o SVG diretamente filho do container (width/height:100%) e não todos os SVG internos. IDs de inputs e modelos estão no blueprint do componente; use props/ref para alterar a sessão, sem editar a geometria constante. Ref dispõe de play/pause/reset, inputs/gatilhos, diagnóstico, getData/editData, bindDataInstance/getDataInstance (troca a instância ligada à prancheta; reset volta à padrão), avanço manual e enableAudio/disableAudio/setAudioVolume/inspectAudio. onAudioCue entrega alternativas textuais mesmo com áudio desativado; efeitos WAV PCM16 exigem ativação explícita. Texto continua texto, não HTML.\n\nLayouts são recalculados no tamanho do host; CSP deve permitir wasm-unsafe-eval, não unsafe-eval. Sem rede ou licença do editor em execução. Fontes do sistema precisam existir no consumidor; PNG, fontes TTF/OTF incorporadas, gradientes, nine-slice, recortes/máscaras de silhueta alpha e efeitos WAV seguem os perfis do editor e são incluídos quando usados. Carregar uma fonte não certifica cobertura de todos os glifos; preserve seus avisos/licenças. React Native requer adapter próprio e não é implementado por este ZIP. Não é arquivo .riv.\n\nMantenha THIRD_PARTY_LICENSES.txt junto ao runtime ao redistribuir. Não há chaves, dados de conta ou código de servidor neste pacote. O conteúdo é somente a prancheta selecionada e suas dependências compiladas.\n`;
  const files: Record<string, string> = {
    "EdiAnimation.jsx": component,
    "EdiAnimation.d.ts": reactArtifactDeclaration,
    "edi-react-player.mjs": runtime,
    "README.md": `${readme}\n## Documento portátil\n\nO blueprint v9 contém a descrição gráfica tipada e somente os recursos usados, uma vez no catálogo raiz assets. Preserva primitivas nativas como fontes de recorte/máscara; não certifica efeitos SVG fora do perfil do editor. VisualArtwork compartilha o desenho do editor; EdiSvgPlayer carrega e libera seus recursos. Não edite o catálogo para substituir URLs: imagens/fontes/PCM são verificados por bytes/hash. A cadeia de fontes alternativas usa fontFallbackIds tipados e cobertura cmap por cluster inteiro; caracteres ausentes recusam a mudança de sessão antes de alterar o desenho. Cobertura não certifica shaping/ligaturas. O runtime continua aceitando blueprints históricos com o contrato correspondente.\n`,
    "THIRD_PARTY_LICENSES.txt": licenses,
    "NextExample.tsx": nextExample,
  };
  const encoded = Object.fromEntries(
    Object.entries(files).map(([key, value]) => [key, strToU8(value)]),
  );
  if (Object.values(encoded).reduce((total, value) => total + value.length, 0) > 10000000)
    throw new Error("Pacote React excede 10 MB sem compressão.");
  const content = zipSync(encoded, { level: 0, mtime: new Date(1980, 0, 1) });
  if (content.length > 10000000) throw new Error("Pacote React excede 10 MB.");
  return { content, extension: "react.zip", type: "application/zip" };
}
