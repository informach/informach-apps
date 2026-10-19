import fontkit from "@pdf-lib/fontkit";
import { inspectEditableFont } from "@shared/font-file";
import { fontInspectionRequestSchema } from "@shared/font-worker-format";

self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const { bytes } = fontInspectionRequestSchema.parse(event.data),
      info = inspectEditableFont(bytes),
      font = fontkit.create(bytes);
    if (
      typeof font.familyName !== "string" ||
      !font.familyName.trim() ||
      typeof font.subfamilyName !== "string"
    )
      throw new Error("A fonte não contém nomes de família e estilo válidos.");
    self.postMessage({
      ok: true,
      info,
      family: font.familyName.slice(0, 512),
      subfamily: font.subfamilyName.slice(0, 512),
    });
  } catch (failure) {
    self.postMessage({
      ok: false,
      error: (failure instanceof Error ? failure.message : "Fonte inválida.").slice(0, 2000),
    });
  }
};
