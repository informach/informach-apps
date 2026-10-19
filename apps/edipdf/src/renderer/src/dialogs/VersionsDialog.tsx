import type { VersionList } from "@shared/document-format";
import { useCallback, useEffect, useState } from "react";
import { restoreRecovery } from "../lib/actions";
import { useApp } from "../state/store";
import { Modal } from "./Dialogs";

export function VersionsDialog(): React.ReactElement {
  const [list, setList] = useState<VersionList | null>(null),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setList(await window.api.versions.list());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao carregar versões.");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const close = () => {
    if (!running) useApp.setState({ dialog: null });
  };
  return (
    <Modal
      title="Histórico local de versões"
      width={720}
      onClose={close}
      footer={
        <>
          <span className="muted small">
            {list
              ? `${list.entries.length} versões · ${(list.totalBytes / 1048576).toFixed(1)} MB neste dispositivo`
              : "Carregando…"}
          </span>
          <div className="spacer" />
          <button type="button" className="btn ghost" disabled={running} onClick={close}>
            Fechar
          </button>
        </>
      }
    >
      <p className="muted">
        Restaurar abre outra aba para salvar uma cópia. Versões anteriores podem conter informações
        removidas por redação ou sanitização. A retenção e a limpeza ficam nas preferências.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!!list?.unreadable && (
        <p role="alert">
          {list.unreadable} arquivo(s) de versão ilegível(is) preservado(s). A limpeza explícita nas
          preferências também os remove.
        </p>
      )}
      {list && !list.entries.length && <p>Nenhuma versão local disponível.</p>}
      <ul className="version-list">
        {list?.entries.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{entry.name}</strong>
              <p className="muted small">
                {new Date(entry.updatedAt).toLocaleString("pt-BR")} ·{" "}
                {(entry.bytes / 1048576).toFixed(1)} MB
              </p>
            </div>
            <button
              type="button"
              className="btn ghost sm"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  await restoreRecovery(entry.id, true);
                } finally {
                  setRunning(false);
                }
              }}
            >
              Restaurar em nova aba
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={running}
              onClick={async () => {
                const choice = await window.api.message({
                  type: "question",
                  message: `Excluir esta versão de ${entry.name}?`,
                  buttons: ["Excluir versão", "Cancelar"],
                });
                if (choice !== 0) return;
                setRunning(true);
                setError("");
                try {
                  await window.api.versions.remove(entry.id);
                  await refresh();
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : "Falha ao excluir.");
                } finally {
                  setRunning(false);
                }
              }}
            >
              Excluir
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
