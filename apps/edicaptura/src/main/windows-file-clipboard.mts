import { spawn } from "node:child_process";
import { nativeHelper } from "./native-helper.ts";

/**
 * Puts the final export on the clipboard as a file reference (CF_HDROP), through the `filedrop`
 * command of the app's own helper (@informach/edi-native, FileDrop.cs). The file name and the
 * expected size and SHA-256 travel only as stdin JSON; the helper refuses a changed or replaced file.
 */
export function writeWindowsFileDrop(
  file: string,
  sha256: string,
  size: number,
  helper?: string,
): Promise<void> {
  if (process.platform !== "win32")
    return Promise.reject(new Error("Copiar arquivo está disponível no Windows."));
  return new Promise((resolve, reject) => {
    const child = spawn(helper ?? nativeHelper(), ["filedrop"], {
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"],
      timeout: 30_000,
    });
    child.on("error", () =>
      reject(new Error("Não foi possível iniciar a cópia do arquivo no Windows.")),
    );
    child.stdin.on("error", () =>
      reject(new Error("Não foi possível enviar o arquivo ao Windows.")),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Não foi possível copiar o arquivo. Verifique se ele existe e tente novamente; a área de transferência pode estar ocupada.",
            ),
          ),
    );
    child.stdin.end(JSON.stringify({ file, sha256, size }));
  });
}
