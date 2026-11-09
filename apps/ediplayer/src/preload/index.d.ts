import type { EdiPlayerApi } from "../shared/types.ts";

declare global {
  interface Window {
    api: EdiPlayerApi;
  }
}
