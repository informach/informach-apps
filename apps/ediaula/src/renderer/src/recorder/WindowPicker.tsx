import { plural } from "@shared/plural";
import type { CaptureWindow } from "@shared/recording";
import { AppWindow, Loader, RefreshCw, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

/** The program's file name, without the folder and the extension ("chrome"). */
const programOf = (exe: string | null): string =>
  exe
    ? (exe
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.exe$/i, "") ?? "")
    : "";

/**
 * "Janela…": the windows open on the computer (never the app's own), to fit the region to one.
 * The take then follows it and warns when it leaves the region or is minimized; "Manter à frente"
 * keeps it above the other windows while recording.
 */
export function WindowPicker({
  current,
  onPick,
  onClose,
}: {
  current: { window: CaptureWindow; front: boolean } | null;
  onPick: (window: CaptureWindow, front: boolean) => void;
  onClose: () => void;
}): ReactNode {
  const [windows, setWindows] = useState<CaptureWindow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [front, setFront] = useState(current?.front ?? true);
  const load = useCallback(() => {
    setWindows(null);
    setProblem(null);
    window.api.recorder.windows().then(setWindows, (error: unknown) => {
      setWindows([]);
      setProblem(error instanceof Error ? error.message : String(error));
    });
  }, []);
  useEffect(() => load(), [load]);
  const open = (windows ?? []).filter((w) => !w.minimized);
  const minimized = (windows ?? []).length - open.length;
  return (
    <div className="rec-windows" role="dialog" aria-label="Gravar uma janela">
      <div className="rec-opt-head">
        <strong>
          <AppWindow size={15} /> Gravar uma janela
        </strong>
        <button type="button" className="rec-icon" title="Atualizar a lista" onClick={load}>
          <RefreshCw size={14} />
        </button>
        <button type="button" className="rec-icon" title="Fechar" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <p className="muted">
        A região se encaixa na janela escolhida. Durante a gravação, o gravador avisa se ela sair da
        região ou for minimizada.
      </p>
      {windows === null ? (
        <p className="muted">
          <Loader size={14} className="spin" /> Procurando as janelas abertas…
        </p>
      ) : open.length ? (
        <ul className="rec-windows-list">
          {open.map((w) => (
            <li key={w.hwnd}>
              <button
                type="button"
                className={current?.window.hwnd === w.hwnd ? "is-active" : ""}
                title={w.title}
                onClick={() => onPick(w, front)}
              >
                <strong className="rec-windows-title">{w.title}</strong>
                <small className="muted">
                  {[programOf(w.exe), `${w.width} × ${w.height}`].filter(Boolean).join(" · ")}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{problem ?? "Nenhuma janela aberta para gravar."}</p>
      )}
      {minimized > 0 && (
        <p className="muted">
          {plural(minimized, "janela minimizada ficou", "janelas minimizadas ficaram")} de fora:
          abra a janela para poder escolher.
        </p>
      )}
      <label className="rec-opt-check">
        <input type="checkbox" checked={front} onChange={(e) => setFront(e.target.checked)} />
        Manter a janela à frente das outras durante a gravação
      </label>
    </div>
  );
}
