import type { Finding } from "@shared/preflight";
import { AlertTriangle, CircleCheck, Info, OctagonAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { goToFinding, runFix } from "@/lib/preflight";
import { Button } from "@/ui";

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const ICON = { error: OctagonAlert, warn: AlertTriangle, info: Info } as const;

/**
 * The findings of the check before exporting, each with "Ir até" and its fix. Used by the export
 * dialog and by the last step of "Preparar aula". `onFixed` runs after a fix, to check again.
 */
export function PreflightList({
  findings,
  onFixed,
  normalize,
}: {
  findings: Finding[];
  onFixed?: () => void;
  normalize?: () => void;
}): ReactNode {
  const [busy, setBusy] = useState<number | null>(null);
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
            {f.fix && (f.fix.action !== "normalize" || normalize) && (
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setBusy(i);
                  void runFix(f, { normalize }).then((done) => {
                    setBusy(null);
                    if (done) onFixed?.();
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
