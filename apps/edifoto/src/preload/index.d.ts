import type { EdiFotoApi } from "../shared/types.ts";

declare global {
  interface Window {
    api: EdiFotoApi;
  }
}
