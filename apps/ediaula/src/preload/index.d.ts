import type { EdiAulaApi } from "../shared/types.ts";

declare global {
  interface Window {
    api: EdiAulaApi;
  }
}
