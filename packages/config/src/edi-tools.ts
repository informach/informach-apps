export const EDI_APP = "edi";

export const EDI_TOOLS = [
  {
    id: "ediaula",
    name: "EdiAula",
    sourceFolder: "EDIAULA",
    windowsAppId: "br.com.informach.ediaula",
    description: "Grave e edite a aula pelo texto",
    projectExtensions: ["ediaula"],
    nativeMedia: { testScript: "test:media-native" },
    // Compiled by the app build from @informach/edi-native plus native/helper; outside the ASAR.
    nativeHelper: { executable: "ediaula-helper.exe" },
  },
  {
    id: "edicaptura",
    name: "EdiCaptura",
    sourceFolder: "EDICAPTURA",
    windowsAppId: "br.com.informach.edicaptura",
    description: "Capture a tela e explique",
    projectExtensions: [],
    nativeMedia: { testScript: "test:video-native" },
    // Capture bridge and file clipboard, compiled by the app build from @informach/edi-native.
    nativeHelper: { executable: "edicaptura-helper.exe" },
    // Ships @informach/edi-ocr (worker, cores, models, licenses) in its own renderer.
    ocr: true,
  },
  {
    id: "edifoto",
    name: "EdiFoto",
    sourceFolder: "EDIFOTO",
    windowsAppId: "br.com.informach.edifoto",
    description: "Trate imagens com camadas",
    projectExtensions: ["edifoto"],
  },
  {
    id: "edipdf",
    name: "EdiPDF",
    sourceFolder: "EDIPDF",
    windowsAppId: "br.com.informach.edipdf",
    description: "Organize, preencha e assine PDFs",
    projectExtensions: ["pdf"],
    // Ships @informach/edi-ocr (worker, cores, models, licenses) in its own renderer.
    ocr: true,
  },
  {
    id: "edisvg",
    name: "EdiSVG",
    sourceFolder: "EDISVG",
    windowsAppId: "br.com.informach.edisvg",
    description: "Anime ilustrações vetoriais",
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

export function hasNativeMedia(id: string): boolean {
  return EDI_TOOLS.some((tool) => tool.id === id && "nativeMedia" in tool && !!tool.nativeMedia);
}

/**
 * The tool's own native helper (`resources/native/<executable>`), built from `@informach/edi-native`
 * by the app build. The installer carries it outside the ASAR and refuses a missing or stale one.
 */
export function nativeHelperExecutable(id: string): string | undefined {
  for (const tool of EDI_TOOLS)
    if (tool.id === id && "nativeHelper" in tool) return tool.nativeHelper.executable;
  return undefined;
}

/** Tools that ship the local OCR of `@informach/edi-ocr` in their own installer. */
export function hasOcr(id: string): boolean {
  return EDI_TOOLS.some((tool) => tool.id === id && "ocr" in tool && tool.ocr);
}
