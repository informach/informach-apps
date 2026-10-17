import type { EdiPdfApi } from "../shared/types.ts";

declare global {
  interface Window {
    api: EdiPdfApi;
  }
}
