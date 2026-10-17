export const EDI_APP = "edi";

export const EDI_TOOLS = [
  {
    id: "ediaula",
    name: "EdiAula",
    sourceFolder: "EDIAULA",
    windowsAppId: "br.com.informach.ediaula",
    description: "Edição de vídeo e preparação de aulas",
    projectExtensions: ["ediaula"],
  },
  {
    id: "edicaptura",
    name: "EdiCaptura",
    sourceFolder: "EDICAPTURA",
    windowsAppId: "br.com.informach.edicaptura",
    description: "Captura de tela, gravação e anotações",
    projectExtensions: [],
  },
  {
    id: "edifoto",
    name: "EdiFoto",
    sourceFolder: "EDIFOTO",
    windowsAppId: "br.com.informach.edifoto",
    description: "Edição de imagens, camadas e composição",
    projectExtensions: ["edifoto"],
  },
  {
    id: "edipdf",
    name: "EdiPDF",
    sourceFolder: "EDIPDF",
    windowsAppId: "br.com.informach.edipdf",
    description: "Organização e edição de documentos PDF",
    projectExtensions: ["pdf"],
  },
  {
    id: "edisvg",
    name: "EdiSVG",
    sourceFolder: "EDISVG",
    windowsAppId: "br.com.informach.edisvg",
    description: "Criação e animação vetorial SVG",
    projectExtensions: ["edisvg"],
  },
] as const;

export type EdiToolId = (typeof EDI_TOOLS)[number]["id"];

export function isEdiToolId(value: string): value is EdiToolId {
  return EDI_TOOLS.some((tool) => tool.id === value);
}

export const EDI_HUB = {
  id: "edi-hub",
  name: "Edi Hub",
  windowsAppId: "br.com.informach.edi-hub",
} as const;

export const EDI_DESKTOP_APPS = [EDI_HUB, ...EDI_TOOLS] as const;
