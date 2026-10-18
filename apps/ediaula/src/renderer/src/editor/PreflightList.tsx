import { AlertTriangle, CircleCheck, Info, OctagonAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { checkIsCurrent, goToFinding, type LessonCheck, runFix } from "@/lib/preflight";
import { Button } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const ICON = { error: OctagonAlert, warn: AlertTriangle, info: Info } as const;

/**
 * The findings of the check before exporting, each with "Ir até" and its fix. Used by the export
 * dialog and by the last step of "Preparar aula". A fix only acts on the revision of the lesson
 * the list was made on; `onFixed` runs after a fix (or a refused one), to check again.
 */
export function PreflightList({
  check,
  onFixed,
  normalize,
  withoutCursor,
}: {
  check: LessonCheck;
  onFixed?: () => void;
  normalize?: () => void;
  /** "Exportar sem o cursor": only the export dialog offers it. */
  withoutCursor?: () => void;
}): ReactNode {
  const [busy, setBusy] = useState<number | null>(null);
  const { findings } = check;
  const stale = !checkIsCurrent(check);
  if (!findings.length)
    return (
      <p className="preflight-ok">
        <CircleCheck size={14} className="accent" /> Nada a corrigir antes de exportar.
      </p>
    );
  return (
    <ul className="preflight-list" aria-label="Verificação antes de exportar">
      {findings.map((f, i) => {
        const Icon = ICON[f.severity];
        return (
          <li
            key={`${f.kind}:${f.at ?? ""}:${f.message}`}
            className={`preflight-item is-${f.severity}`}
          >
            <Icon size={14} className="preflight-icon" />
            <span className="preflight-text">{f.message}</span>
            {f.at !== undefined && (
              <button type="button" className="link mono" onClick={() => goToFinding(f)}>
                Ir até {clock(f.at)}
              </button>
            )}
            {f.fix &&
              (f.fix.action !== "normalize" || normalize) &&
              (f.fix.action !== "without-cursor" || withoutCursor) && (
                <Button
                  size="sm"
                  disabled={busy !== null || stale}
                  title={stale ? "A aula mudou: a lista está sendo conferida de novo" : undefined}
                  onClick={() => {
                    setBusy(i);
                    void runFix(f, check, { normalize, withoutCursor }).then(() => {
                      setBusy(null);
                      onFixed?.();
                    });
                  }}
                >
                  {busy === i ? "Corrigindo…" : f.fix.label}
                </Button>
              )}
          </li>
        );
      })}
    </ul>
  );
}
