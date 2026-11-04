import { win32 } from "node:path";

/**
 * The files a lesson opened from elsewhere points at, as the person sees them before they are
 * allowed (index.ts, project:open). Nothing can hide in the list: every network computer is
 * named and every file outside the lesson's folder is counted, even when only some are listed.
 */

/** Files listed one by one before the rest is only counted. */
export const LISTED = 20;

/** `\\.\…` and `\\?\GLOBALROOT…`: a device, never a media file of a lesson. */
const DEVICE = /^[\\/]{2}[.?][\\/](?!unc[\\/]|[a-z]:)/i;

/** The computer a network path is on (`\\server\share`, `\\?\UNC\server\share`), else null. */
export function networkHost(path: string): string | null {
  const m = /^[\\/]{2}(?:\?[\\/]unc[\\/])?([^\\/?.][^\\/]*)/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}

/** A path a lesson may point at: refused for devices. */
export const isDevicePath = (path: string): boolean => DEVICE.test(path);

/** Whether `path`, resolved (no `..` left), is inside `folder`. */
export function insideFolder(path: string, folder: string): boolean {
  const own = `${win32.resolve(folder).toLowerCase().replace(/\\+$/, "")}\\`;
  return win32.resolve(path).toLowerCase().startsWith(own);
}

/** The dialog's detail: the network computers, then the files outside the lesson's folder. */
export function linkedFilesDetail(linked: readonly string[], folder: string): string {
  const outside = linked.filter((p) => !insideFolder(p, folder));
  const hosts = [...new Set(outside.map(networkHost).filter((h): h is string => !!h))];
  const lines: string[] = [];
  if (hosts.length)
    lines.push(
      `Arquivos em outros computadores da rede (o Windows pode enviar a sua autenticação a eles): ${hosts.join(", ")}.`,
      "",
    );
  if (!outside.length) lines.push(`Todos os ${linked.length} ficam na pasta da aula.`);
  else {
    lines.push(
      outside.length === linked.length
        ? `${linked.length} ${linked.length === 1 ? "arquivo fica" : "arquivos ficam"} fora da pasta da aula:`
        : `${outside.length} de ${linked.length} ficam fora da pasta da aula:`,
      ...outside.slice(0, LISTED),
    );
    if (outside.length > LISTED)
      lines.push(`… e mais ${outside.length - LISTED} fora da pasta da aula.`);
  }
  return lines.join("\n");
}
