/**
 * A design kit as the main process reads it from a ZIP (src/main/designKit.ts) and the window
 * imports it (src/renderer/src/designKitImport.ts): its SVGs as text and its PNGs as bytes, by
 * their path inside the kit's folder.
 */

export type KitFile = { path: string; svg: string } | { path: string; png: Uint8Array };

export interface DesignKit {
  /** The kit's folder in the ZIP (or the ZIP's name when the files are at its root). */
  name: string;
  /** Paths relative to the kit's folder, in the order of the archive. */
  files: KitFile[];
  /** What did not come in, with the reason: said to the person after the import. */
  left: string[];
}

/**
 * Every artboard of a kit is named "Kit · <folder> · <file>": the artboards list groups them, and
 * a pipeline offers them to the assistant as the kit's components (a renamed one stops being).
 */
export const KIT_PREFIX = "Kit · ";
export const isKitBoardName = (name: string): boolean => name.startsWith(KIT_PREFIX);
