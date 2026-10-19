/** A file read from disk, handed to the renderer. */

import type { ClipboardPaste } from "./clipboard-format.ts";
import type { RecoveryDocument, RecoveryList, VersionList } from "./document-format.ts";
import type { Annot } from "./model.ts";
import type { PdfPreferences } from "./preferences.ts";
import type { ScannerDevice, ScannerSource } from "./scanner-format.ts";
import type { PdfSession } from "./session-format.ts";
import type {
  LocalTaskOutcome,
  LocalTaskRequest,
  PendingLocalTask,
  PendingTaskList,
  ResolvedCompressionInput,
} from "./task-format.ts";
export interface OpenedFile {
  path: string;
  name: string;
  bytes: Uint8Array;
}

export interface RecentFile {
  pinned?: boolean;
  available?: boolean;
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
  strokes?: { points: number[]; color: string; width: number }[];
}

export type UnsavedChoice = "save" | "discard" | "cancel";

export interface EdiPdfApi {
  clipboard: {
    copy(annotations: Annot[]): Promise<void>;
    paste(): Promise<ClipboardPaste>;
  };
  scanners: {
    list(): Promise<ScannerDevice[]>;
    sources(deviceId: string): Promise<ScannerSource[]>;
  };
  printers(): Promise<{ name: string; label: string }[]>;
  tasks: {
    run(request: LocalTaskRequest): Promise<LocalTaskOutcome>;
    list(): Promise<PendingTaskList>;
    load(id: string): Promise<PendingLocalTask>;
    input(id: string): Promise<ResolvedCompressionInput>;
    remove(id: string): Promise<void>;
  };
  session: {
    load: () => Promise<{ session: PdfSession; unavailable: number }>;
    save: (session: PdfSession) => Promise<void>;
    clear: () => Promise<void>;
  };
  versions: {
    list: () => Promise<VersionList>;
    load: (id: string) => Promise<RecoveryDocument>;
    save: (document: RecoveryDocument) => Promise<void>;
    remove: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  preferences: {
    get: () => Promise<PdfPreferences>;
    set: (preferences: PdfPreferences) => Promise<PdfPreferences>;
    repair: (
      kind: "preferences" | "recents" | "signatures" | "session",
    ) => Promise<{ backup: boolean }>;
  };
  recovery: {
    list: () => Promise<RecoveryList>;
    load: (id: string) => Promise<RecoveryDocument>;
    save: (document: RecoveryDocument) => Promise<{ versionError?: string }>;
    remove: (id: string) => Promise<void>;
  };
  openDialog: (opts?: {
    images?: boolean;
    multi?: boolean;
    title?: string;
  }) => Promise<OpenedFile[]>;
  readFile: (path: string) => Promise<OpenedFile | null>;
  pickData: (kind: "attachment" | "formdata" | "font" | "office") => Promise<OpenedFile | null>;
  saveDataDialog: (name: string) => Promise<string | null>;
  openWebLink: (url: string) => Promise<void>;
  saveDialog: (defaultName: string, kind?: "pdf" | "png" | "jpg") => Promise<string | null>;
  pickFolder: (title?: string) => Promise<string | null>;
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>;
  writeCopy: (path: string, bytes: Uint8Array) => Promise<void>;
  writeFiles: (folder: string, files: { name: string; bytes: Uint8Array }[]) => Promise<string[]>;
  /** Writes next to `path` without overwriting: adds " (2)", " (3)"… when the name is taken. */
  writeUnique: (path: string, bytes: Uint8Array) => Promise<string>;
  showInFolder: (path: string) => Promise<void>;
  recent: {
    pin: (path: string, pinned: boolean) => Promise<RecentFile[]>;
    list: () => Promise<RecentFile[]>;
    add: (entry: RecentFile) => Promise<RecentFile[]>;
    remove: (path: string) => Promise<RecentFile[]>;
    clear: () => Promise<RecentFile[]>;
    removeThumbnails: () => Promise<RecentFile[]>;
  };
  signatures: {
    list: () => Promise<SavedSignature[]>;
    save: (sig: SavedSignature) => Promise<SavedSignature[]>;
    remove: (id: string) => Promise<SavedSignature[]>;
    clear: () => Promise<SavedSignature[]>;
  };
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
