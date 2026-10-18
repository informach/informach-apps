import { focusOnMount } from "@informach/edi-desktop/renderer";
import type { ReframeMode } from "@shared/compose";
import type { BackupEntry, ProjectSettings } from "@shared/types";
import { History, Ratio } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { actions } from "@/lib/actions";
import { bytes, duration } from "@/lib/format";
import { renameLesson, restoreLesson } from "@/lib/projectFiles";
import { useApp } from "@/state/app";
import { useProject } from "@/state/project";
import { Button, Modal } from "@/ui";

/** Renomear: the lesson's name, and its file with it. */
export function RenameDialog({
  path,
  name,
  onClose,
  onDone,
}: {
  path: string;
  name: string;
  onClose: () => void;
  onDone?: (path: string) => void;
}): ReactNode {
  const [text, setText] = useState(name);
  const [busy, setBusy] = useState(false);
  const submit = async (): Promise<void> => {
    if (busy || !text.trim()) return;
    setBusy(true);
    const target = await renameLesson(path, text);
    setBusy(false);
    if (target) {
      onDone?.(target);
      onClose();
    }
  };
  return (
    <Modal label="Renomear aula" onClose={onClose} width={460}>
      <form
        className="modal-body stack-16"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="modal-title">Renomear aula</h2>
        <label className="field">
          <span className="field-label">Nome da aula</span>
          <input
            className="input"
            ref={focusOnMount}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="muted">O arquivo da aula e as cópias de segurança passam a ter esse nome.</p>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
            Renomear
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const when = (at: number): string =>
  new Date(at).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Restaurar cópia de segurança: the copies kept beside the lesson (one every 10 minutes of
 * editing, the last 20). Restoring makes what the lesson is now one more copy first.
 */
export function BackupsDialog({
  path,
  onClose,
  onRestored,
}: {
  path: string;
  onClose: () => void;
  onRestored?: () => void;
}): ReactNode {
  const [list, setList] = useState<BackupEntry[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BackupEntry | null>(null);
  useEffect(() => {
    let alive = true;
    window.api.projectBackups(path).then(
      (entries) => alive && setList(entries),
      (err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      alive = false;
    };
  }, [path]);
  const restore = async (entry: BackupEntry): Promise<void> => {
    setBusy(entry.id);
    const ok = await restoreLesson(path, entry.id);
    setBusy(null);
    if (ok) {
      onRestored?.();
      onClose();
    }
  };
  return (
    <Modal label="Cópias de segurança" onClose={onClose} width={560}>
      <div className="modal-body stack-16">
        <div className="modal-title-row">
          <History size={18} color="var(--accent)" />
          <h2 className="modal-title">Cópias de segurança</h2>
        </div>
        <p className="muted">
          Enquanto você edita, o EdiAula guarda uma cópia da aula a cada 10 minutos (as últimas 20).
          Restaurar põe a cópia no lugar da aula; o que a aula é agora vira mais uma cópia, então dá
          para voltar.
        </p>
        {error && <p role="alert">{error}</p>}
        {list === null && !error && <p className="muted">Procurando as cópias…</p>}
        {list?.length === 0 && (
          <p className="muted">Esta aula ainda não tem cópias de segurança.</p>
        )}
        {!!list?.length && (
          <ul className="backup-list">
            {list.map((entry) => (
              <li key={entry.id} className={confirm?.id === entry.id ? "is-confirming" : ""}>
                <div className="backup-info">
                  <strong>{when(entry.at)}</strong>
                  <span className="muted">
                    {entry.duration !== undefined
                      ? `${duration(entry.duration)} na timeline · `
                      : ""}
                    {entry.clips !== undefined
                      ? `${entry.clips} ${entry.clips === 1 ? "clipe" : "clipes"} · `
                      : ""}
                    {bytes(entry.size)}
                  </span>
                </div>
                {confirm?.id === entry.id ? (
                  <span className="row-6">
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      Voltar
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!!busy}
                      onClick={() => void restore(entry)}
                    >
                      {busy === entry.id ? "Restaurando…" : "Restaurar esta"}
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirm(entry)}>
                    Restaurar…
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

/** The sizes Mudar formato offers (the frame rate stays the lesson's). */
const SIZES: { id: string; label: string; width: number; height: number }[] = [
  { id: "1080p30", label: "1920 × 1080 (horizontal)", width: 1920, height: 1080 },
  {
    id: "vertical30",
    label: "1080 × 1920 (vertical: Reels, Shorts, celular)",
    width: 1080,
    height: 1920,
  },
  { id: "square", label: "1080 × 1080 (quadrado)", width: 1080, height: 1080 },
  { id: "4k30", label: "3840 × 2160 (4K)", width: 3840, height: 2160 },
  { id: "720p30", label: "1280 × 720", width: 1280, height: 720 },
];

/**
 * Mudar formato: the lesson in another frame size. "Encaixar" shows the whole old frame inside
 * the new one; "Preencher" covers the new one, cutting off what goes past it. One Ctrl+Z.
 */
export function ReframeDialog(): ReactNode {
  const project = useProject((s) => s.project);
  const close = (): void => useApp.getState().set({ reframeOpen: false });
  const current = project?.settings;
  const [size, setSize] = useState(
    () =>
      SIZES.find((s) => s.width !== current?.width || s.height !== current?.height)?.id ??
      SIZES[0].id,
  );
  const [mode, setMode] = useState<ReframeMode>("fit");
  if (!project || !current) return null;
  const chosen = SIZES.find((s) => s.id === size) ?? SIZES[0];
  const same = chosen.width === current.width && chosen.height === current.height;
  const apply = (): void => {
    const settings: ProjectSettings = { ...current, width: chosen.width, height: chosen.height };
    actions.reframe(settings, mode);
    close();
    useApp
      .getState()
      .toast(
        `Formato ${chosen.width} × ${chosen.height}. Ctrl+Z volta ao ${current.width} × ${current.height}.`,
        "success",
      );
  };
  return (
    <Modal label="Mudar formato" onClose={close} width={520}>
      <div className="modal-body stack-16">
        <div className="modal-title-row">
          <Ratio size={18} color="var(--accent)" />
          <h2 className="modal-title">Mudar formato</h2>
        </div>
        <p className="muted">
          Agora: {current.width} × {current.height} · {current.fps} fps.
        </p>
        <label className="field">
          <span className="field-label">Novo formato</span>
          <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span className="field-label">O que fazer com a imagem de agora</span>
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${mode === "fit" ? "is-active" : ""}`}
              aria-pressed={mode === "fit"}
              onClick={() => setMode("fit")}
            >
              Encaixar
            </button>
            <button
              type="button"
              className={`chip ${mode === "fill" ? "is-active" : ""}`}
              aria-pressed={mode === "fill"}
              onClick={() => setMode("fill")}
            >
              Preencher
            </button>
          </div>
          <span className="field-hint">
            {mode === "fit"
              ? "A imagem de agora aparece inteira no novo formato, com faixas onde ela não chega. Nada fica cortado."
              : "A imagem de agora cobre o novo formato inteiro; o que passar das bordas fica de fora."}
          </span>
        </div>
        <p className="muted">
          Cada clipe mantém o lugar e o tamanho em relação à imagem de agora, inclusive o movimento
          e o ponto das camadas de zoom. Ajuste depois o que precisar.
        </p>
        <div className="modal-actions">
          <Button onClick={close}>Cancelar</Button>
          <Button variant="primary" disabled={same} onClick={apply}>
            Mudar formato
          </Button>
        </div>
      </div>
    </Modal>
  );
}
