import type { EdiPdfApi, OpenedFile } from "@shared/types";
import { toast } from "../state/store";

/** A failed native selection is reported without leaving a rejected event handler. */
export async function chooseFiles(
  options?: Parameters<EdiPdfApi["openDialog"]>[0],
): Promise<OpenedFile[]> {
  try {
    return await window.api.openDialog(options);
  } catch (failure) {
    toast(
      failure instanceof Error ? failure.message : "Não foi possível ler os arquivos escolhidos.",
      { tone: "error" },
    );
    return [];
  }
}
