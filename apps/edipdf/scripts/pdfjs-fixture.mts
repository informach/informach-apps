import { fileURLToPath } from "node:url";

// PDF.js validates a forward trailing slash even when its Node factory reads a Windows path.
export const standardFontDataUrl = fileURLToPath(
  new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url),
).replaceAll("\\", "/");
