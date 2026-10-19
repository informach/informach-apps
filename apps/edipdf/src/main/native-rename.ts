import { dirname, isAbsolute, resolve, toNamespacedPath } from "node:path";

type MoveResult = "created" | "exists";
type Mover = (source: string, target: string) => MoveResult;
let adapter: Promise<Mover> | undefined;
const integer = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new Error("Resposta inválida do sistema de arquivos nativo.");
  return value;
};
async function loadAdapter(): Promise<Mover> {
  const { default: koffi } = await import("koffi");
  if (process.platform === "win32") {
    const kernel = koffi.load("kernel32.dll");
    const move = kernel.func(
      "int __stdcall MoveFileExW(str16 source, str16 target, uint32_t flags)",
    );
    const error = kernel.func("uint32_t __stdcall GetLastError(void)");
    return (source, target) => {
      // No REPLACE_EXISTING or COPY_ALLOWED: same-volume, exclusive atomic rename.
      if (integer(move(toNamespacedPath(source), toNamespacedPath(target), 8)) !== 0)
        return "created";
      const code = integer(error());
      if (code === 80 || code === 183) return "exists";
      throw new Error(`Não foi possível concluir a cópia atômica. Código do Windows: ${code}.`);
    };
  }
  if (process.platform === "linux") {
    const libc = koffi.load("libc.so.6"),
      move = libc.func("int renameat2(int olddir, str source, int newdir, str target, uint flags)");
    return (source, target) => {
      if (integer(move(-100, source, -100, target, 1)) === 0) return "created";
      const code = koffi.errno();
      if (code === koffi.os.errno.EEXIST) return "exists";
      throw new Error(`Não foi possível concluir a cópia atômica. Código do sistema: ${code}.`);
    };
  }
  throw new Error(
    "Cópias atômicas com nomes exclusivos ainda não estão disponíveis neste sistema.",
  );
}
/** Fixed OS functions only; no native function/library name comes from renderer input. */
export async function renameExclusive(source: string, target: string): Promise<MoveResult> {
  if (
    !isAbsolute(source) ||
    !isAbsolute(target) ||
    source.includes("\0") ||
    target.includes("\0") ||
    dirname(source) !== dirname(target) ||
    resolve(source) === resolve(target)
  )
    throw new Error("A cópia atômica exige dois arquivos distintos na mesma pasta.");
  adapter ??= loadAdapter();
  return (await adapter)(source, target);
}
