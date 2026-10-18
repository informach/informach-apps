/**
 * A failed save in words for the person (the top bar's alert and the dialog on leaving), by the
 * kind of error; the technical text stays available under "Ver detalhes".
 */

export type SaveErrorKind = "permission" | "full" | "busy" | "drive" | "message" | "other";

/** The technical text without the IPC wrapping ("Error invoking remote method …: Error: "). */
export const saveErrorDetail = (raw: string): string =>
  raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

/** An operating system error code ("EPERM: …", "UNKNOWN: …"). */
const ERRNO = /\b(E[A-Z]{2,}|UNKNOWN)\b/;

const KINDS: [SaveErrorKind, RegExp][] = [
  // The save writes a temporary file and renames it over the lesson: on Windows a refused rename
  // means another program holds the file (an antivirus, the cloud sync).
  [
    "busy",
    /\b(EBUSY|ETXTBSY)\b|resource busy|being used by another process|\bEPERM\b.*\brename\b/i,
  ],
  ["permission", /\b(EPERM|EACCES|EROFS)\b|operation not permitted|permission denied/i],
  ["full", /\b(ENOSPC|EDQUOT)\b|no space left/i],
  [
    "drive",
    /\b(ENOENT|ENODEV|ENXIO|EIO|ENETUNREACH|EHOSTDOWN|EHOSTUNREACH|ENOTCONN|ETIMEDOUT|UNKNOWN)\b|no such file or directory|network/i,
  ],
];

export function saveErrorKind(raw: string): SaveErrorKind {
  const detail = saveErrorDetail(raw);
  const known = KINDS.find(([, pattern]) => pattern.test(detail))?.[0];
  if (known) return known;
  // The app's own words (a lesson the schema refuses, a limit): shown as they are.
  return !ERRNO.test(detail) && /[áàâãéêíóôõúç]|\b(não|arquivo|projeto|aula)\b/i.test(detail)
    ? "message"
    : "other";
}

type Explained = Exclude<SaveErrorKind, "message">;

const MESSAGES: Record<Explained, string> = {
  permission:
    "O Windows não deixou gravar o arquivo da aula: ele está marcado como somente leitura ou fica numa pasta sem permissão. Salve uma cópia em outra pasta.",
  full: "O disco está cheio. Libere espaço e tente de novo, ou salve uma cópia em outro disco.",
  busy: "Outro programa está usando o arquivo da aula (um antivírus ou a sincronização com a nuvem, por exemplo). Espere um instante e tente de novo.",
  drive:
    "A unidade onde a aula está não respondeu: um pen drive removido ou uma pasta de rede desconectada, por exemplo. Reconecte e tente de novo, ou salve uma cópia em outro lugar.",
  other: "A aula não pôde ser gravada no disco. Tente de novo ou salve uma cópia em outro lugar.",
};

const SHORT: Record<Explained, string> = {
  permission: "Sem permissão para gravar o arquivo",
  full: "Disco cheio",
  busy: "Arquivo em uso por outro programa",
  drive: "Unidade indisponível",
  other: "Não deu para gravar no disco",
};

/** A few words for the top bar, where the full sentence is the tooltip. */
export function saveErrorShort(raw: string): string {
  const kind = saveErrorKind(raw);
  return kind === "message" ? saveErrorDetail(raw) : SHORT[kind];
}

/** The sentence shown for a failed save. */
export function explainSaveError(raw: string): string {
  const kind = saveErrorKind(raw);
  return kind === "message" ? saveErrorDetail(raw) : MESSAGES[kind];
}
