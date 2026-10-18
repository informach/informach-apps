/**
 * File paths that come from an AI model (import_media, add_image, set_audio, open_project).
 * A path the model chose could point at another computer: opening `\\host\share\file` makes
 * Windows authenticate to that host, which can leak the person's credential hash. Only local,
 * absolute drive paths pass; the main process then resolves links and checks the folder.
 */

export type PathVerdict = { ok: true; path: string } | { ok: false; reason: string };

/** Names Windows reserves for devices, in any folder and with any extension. */
const DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i;

const refuse = (reason: string): PathVerdict => ({ ok: false, reason });

/** `C:/a//b/../c` becomes `C:\a\c`, the way Windows reads a drive path (".." stops at the drive). */
function normalizeDrivePath(path: string): string {
  const out: string[] = [];
  for (const segment of path.slice(2).split(/[\\/]+/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return `${path.slice(0, 2).toUpperCase()}\\${out.join("\\")}`;
}

export function classifyPath(input: string): PathVerdict {
  if (!input) return refuse("o caminho está vazio");
  if ([...input].some((ch) => ch.charCodeAt(0) < 32))
    return refuse("o caminho tem caracteres de controle");
  if (/^file:/i.test(input) || /^[a-z][a-z0-9+.-]+:\/\//i.test(input))
    return refuse("é um endereço, não um arquivo deste computador");
  if (/^[\\/]{2}/.test(input))
    return refuse(
      "caminhos de rede ou de dispositivo (\\\\servidor, \\\\?\\, \\\\.\\) não são aceitos",
    );
  if (/^[a-z]:(?![\\/])/i.test(input))
    return refuse("caminhos relativos a uma unidade (como C:arquivo) não são aceitos");
  if (!/^[a-z]:[\\/]/i.test(input))
    return refuse("use o caminho completo do arquivo, começando pela unidade (C:\\...)");
  const rest = input.slice(2);
  if (rest.includes(":"))
    return refuse("fluxos alternativos de arquivo (arquivo:fluxo) não são aceitos");
  const segments = rest.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => DEVICE.test(segment.replace(/[ .]+$/, ""))))
    return refuse("o caminho usa um nome reservado do Windows");
  return { ok: true, path: normalizeDrivePath(input) };
}

/** Whether `path` is inside (or is) one of the folders `roots`, ignoring case as Windows does. */
export function insideAny(path: string, roots: readonly string[]): boolean {
  const target = classifyPath(path);
  if (!target.ok) return false;
  const key = target.path.toLowerCase();
  return roots.some((root) => {
    const folder = classifyPath(root);
    if (!folder.ok) return false;
    const base = folder.path.toLowerCase().replace(/\\+$/, "");
    return key === base || key.startsWith(`${base}\\`);
  });
}
