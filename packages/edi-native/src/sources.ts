import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Folder with the suite's shared C# sources and the manifest template. */
export const nativeSourceDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "csharp");

/** Every helper carries these: its version (`--version`) and the JSON line protocol. */
const core = {
  files: ["HelperInfo.cs", "Json.cs"],
  references: ["System.dll", "System.Core.dll", "System.Web.Extensions.dll"],
} as const;

/**
 * Optional shared modules. A helper includes only what its app dispatches, so an executable never
 * carries a command its app does not use. References are .NET Framework 4.x assemblies.
 */
export const NATIVE_MODULES = {
  /** `capture` and `capture --session`: the protocol of `@informach/edi-desktop/windows-capture`. */
  "window-capture": { files: ["WindowCapture.cs"], references: ["System.Drawing.dll"] },
  /** `filedrop`: one exported file on the clipboard as a file reference, checked by size and hash. */
  "file-drop": {
    files: ["FileDrop.cs"],
    references: ["System.Drawing.dll", "System.Windows.Forms.dll"],
  },
} as const;

export type NativeModule = keyof typeof NATIVE_MODULES;

export function isNativeModule(value: string): value is NativeModule {
  return Object.hasOwn(NATIVE_MODULES, value);
}

/** Absolute C# files and framework references of the core plus the chosen modules, without repeats. */
export function nativeSources(modules: readonly NativeModule[]): {
  files: string[];
  references: string[];
} {
  const files = new Set<string>(core.files);
  const references = new Set<string>(core.references);
  for (const name of modules) {
    if (!isNativeModule(name)) throw new Error(`edi-native: unknown module ${String(name)}`);
    for (const file of NATIVE_MODULES[name].files) files.add(file);
    for (const reference of NATIVE_MODULES[name].references) references.add(reference);
  }
  return {
    files: [...files].map((file) => join(nativeSourceDirectory, file)),
    references: [...references],
  };
}
