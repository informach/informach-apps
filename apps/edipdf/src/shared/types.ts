/** A file read from disk, handed to the renderer. */
export interface OpenedFile {
  path: string;
  name: string;
  bytes: Uint8Array;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
  pages?: number;
  /** Small JPEG data URL of the first page. */
  thumb?: string;
}

export interface SavedSignature {
  id: string;
  /** PNG data URL with transparent background. */
  src: string;
  width: number;
  height: number;
}

export type UnsavedChoice = "save" | "discard" | "cancel";

export interface PrintPage {
  /** JPEG data URL of the rendered page. */
  src: string;
  /** Page size in points. */
  width: number;
  height: number;
}

export interface EdiPdfApi {
  openDialog: (opts?: {
    images?: boolean;
    multi?: boolean;
    title?: string;
  }) => Promise<OpenedFile[]>;
  readFile: (path: string) => Promise<OpenedFile | null>;
  saveDialog: (defaultName: string, kind?: "pdf" | "png" | "jpg") => Promise<string | null>;
  pickFolder: (title?: string) => Promise<string | null>;
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
  writeFiles: (folder: string, files: { name: string; bytes: Uint8Array }[]) => Promise<string[]>;
  /** Writes next to `path` without overwriting: adds " (2)", " (3)"… when the name is taken. */
  writeUnique: (path: string, bytes: Uint8Array) => Promise<string>;
  showInFolder: (path: string) => Promise<void>;
  recent: {
    list: () => Promise<RecentFile[]>;
    add: (entry: RecentFile) => Promise<RecentFile[]>;
    remove: (path: string) => Promise<RecentFile[]>;
  };
  signatures: {
    list: () => Promise<SavedSignature[]>;
    save: (sig: SavedSignature) => Promise<SavedSignature[]>;
    remove: (id: string) => Promise<SavedSignature[]>;
  };
  print: (pages: PrintPage[], jobName: string) => Promise<boolean>;
  confirmUnsaved: (names: string[]) => Promise<UnsavedChoice>;
  message: (opts: {
    type?: "info" | "warning" | "error" | "question";
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }) => Promise<number>;
  pathForFile: (file: File) => string;
  /** Files passed on the command line or via "Abrir com" that are still waiting to be opened. */
  takePendingFiles: () => Promise<string[]>;
  onOpenFiles: (cb: (paths: string[]) => void) => () => void;
  /** Main asks the renderer whether it is OK to close the window. */
  onCloseRequest: (cb: () => void) => () => void;
  closeNow: () => void;
  setTitle: (title: string) => void;
}
