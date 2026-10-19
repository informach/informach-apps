import { type PdfPreferences, preferencesSchema, TOOL_SHORTCUT_TOOLS } from "@shared/preferences";
import { useState } from "react";
import { loadPreferences, savePreferences, usePreferences } from "../state/preferences";
import { toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";

const tools = {
  select: "Selecionar",
  hand: "Mão",
  text: "Texto",
  edittext: "Editar texto",
  highlight: "Realçar",
  ink: "Desenhar",
  note: "Comentário",
};
export function PreferencesDialog(): React.ReactElement {
  const current = usePreferences((state) => state.value),
    loadError = usePreferences((state) => state.error);
  const [value, setValue] = useState<PdfPreferences>(current);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const close = () => {
    if (!running) useApp.setState({ dialog: null });
  };
  const action = async (label: string, run: () => Promise<void>) => {
    if (running) return;
    const result = await window.api.message({
      type: "question",
      title: label,
      message: label,
      buttons: ["Continuar", "Cancelar"],
    });
    if (result !== 0) return;
    setRunning(true);
    setError("");
    try {
      await run();
      toast("Dados locais atualizados.", { tone: "ok" });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha na operação local.");
    } finally {
      setRunning(false);
    }
  };
  return (
    <Modal
      title="Preferências"
      width={720}
      onClose={close}
      footer={
        <>
          <span className="muted small">Configurações e retenção neste dispositivo</span>
          <div className="spacer" />
          <button type="button" className="btn ghost" disabled={running} onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={running || !!loadError}
            onClick={async () => {
              setError("");
              setRunning(true);
              try {
                await savePreferences(preferencesSchema.parse(value));
                useApp.setState({ dialog: null });
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Não foi possível salvar.");
              } finally {
                setRunning(false);
              }
            }}
          >
            Salvar preferências
          </button>
        </>
      }
    >
      {(error || loadError) && (
        <p className="error-text" role="alert">
          {error || loadError}
        </p>
      )}
      <div className="preferences-grid">
        <label className="local-field">
          Tema
          <select
            className="input"
            value={value.theme}
            onChange={(event) => {
              const theme = event.target.value;
              if (theme === "dark" || theme === "light" || theme === "system")
                setValue({ ...value, theme });
            }}
          >
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
            <option value="system">Seguir o sistema</option>
          </select>
        </label>
        <label className="local-field">
          Texto da interface
          <select
            className="input"
            value={value.textSize}
            onChange={(event) =>
              setValue({
                ...value,
                textSize: event.target.value === "large" ? "large" : "standard",
              })
            }
          >
            <option value="standard">Padrão</option>
            <option value="large">Maior</option>
          </select>
        </label>
        <label className="local-field">
          Painel de páginas (px)
          <input
            className="input"
            type="number"
            min={160}
            max={400}
            value={value.sidebarWidth}
            onChange={(event) => setValue({ ...value, sidebarWidth: event.target.valueAsNumber })}
          />
        </label>
        <label className="local-field">
          Painel de propriedades (px)
          <input
            className="input"
            type="number"
            min={220}
            max={480}
            value={value.panelWidth}
            onChange={(event) => setValue({ ...value, panelWidth: event.target.valueAsNumber })}
          />
        </label>
      </div>
      <h3>Privacidade e recentes</h3>
      <label className="local-field">
        <span>
          <input
            type="checkbox"
            checked={value.rememberRecents}
            onChange={(event) => setValue({ ...value, rememberRecents: event.target.checked })}
          />{" "}
          Registrar novos arquivos recentes
        </span>
      </label>
      <label className="local-field">
        <span>
          <input
            type="checkbox"
            checked={value.recentThumbnails}
            onChange={(event) => setValue({ ...value, recentThumbnails: event.target.checked })}
          />{" "}
          Salvar miniaturas de novos recentes
        </span>
      </label>
      <div className="preferences-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={running}
          onClick={() =>
            void action("Limpar a lista de recentes?", async () =>
              useApp.setState({ recents: await window.api.recent.clear() }),
            )
          }
        >
          Limpar recentes
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={running}
          onClick={() =>
            void action("Remover as miniaturas guardadas nos recentes?", async () =>
              useApp.setState({ recents: await window.api.recent.removeThumbnails() }),
            )
          }
        >
          Remover miniaturas salvas
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={running}
          onClick={() =>
            void action("Apagar as assinaturas gráficas salvas neste dispositivo?", async () =>
              useApp.setState({ signatures: await window.api.signatures.clear() }),
            )
          }
        >
          Apagar assinaturas salvas
        </button>
      </div>
      <h3>Histórico local</h3>
      <p className="muted small">
        A recuperação automática guarda o trabalho aberto. As versões guardam revisões anteriores,
        inclusive dados depois removidos por redação. A cota abaixo vale para versões; cada
        recuperação atual tem limite de 160 MB.
      </p>
      <label className="local-field">
        <span>
          <input
            type="checkbox"
            checked={value.restoreSession}
            onChange={(event) => setValue({ ...value, restoreSession: event.target.checked })}
          />{" "}
          Reabrir os PDFs salvos e a posição de leitura ao iniciar
        </span>
      </label>
      <p className="muted small">
        Trabalhos sem salvar continuam disponíveis em Recuperação. As senhas não são guardadas e
        serão solicitadas novamente.
      </p>
      <div className="preferences-grid">
        {(
          [
            ["versions", "Versões por documento", 0, 20],
            ["versionDays", "Retenção em dias", 1, 365],
            ["versionIntervalMinutes", "Intervalo entre versões automáticas (min)", 1, 60],
            ["recoveryStorageMB", "Cota de versões (MB)", 64, 2048],
          ] as const
        ).map(([key, label, min, max]) => (
          <label key={key} className="local-field">
            {label}
            <input
              className="input"
              type="number"
              min={min}
              max={max}
              value={value[key]}
              onChange={(event) => setValue({ ...value, [key]: event.target.valueAsNumber })}
            />
          </label>
        ))}
      </div>
      <div className="preferences-actions">
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => useApp.setState({ dialog: { kind: "versions" } })}
        >
          Ver versões locais
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={running}
          onClick={() =>
            void action("Apagar todas as versões locais, incluindo arquivos ilegíveis?", () =>
              window.api.versions.clear(),
            )
          }
        >
          Apagar histórico de versões
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={running}
          onClick={() =>
            void action("Apagar a lista da sessão anterior?", () => window.api.session.clear())
          }
        >
          Limpar sessão anterior
        </button>
      </div>
      <h3>Atalhos de ferramentas</h3>
      <p className="muted small">
        Uma letra por ferramenta. Ctrl+S, Ctrl+O, Ctrl+F e os demais comandos de documento mantêm os
        atalhos usuais.
      </p>
      <div className="preferences-shortcuts">
        {TOOL_SHORTCUT_TOOLS.map((tool) => (
          <label className="local-field" key={tool}>
            {tools[tool]}
            <input
              className="input"
              maxLength={1}
              aria-label={`Atalho de ${tools[tool]}`}
              autoComplete="off"
              value={value.toolShortcuts[tool]}
              onChange={(event) =>
                setValue({
                  ...value,
                  toolShortcuts: {
                    ...value.toolShortcuts,
                    [tool]: event.target.value.toLowerCase(),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <h3>Reparar dados locais</h3>
      <p className="muted small">
        A reparação guarda uma cópia do arquivo atual antes de reiniciar a configuração ou lista
        escolhida. PDFs e trabalhos de recuperação são preservados.
      </p>
      <div className="preferences-actions">
        {(["preferences", "recents", "signatures", "session"] as const).map((kind) => (
          <button
            type="button"
            className="btn ghost sm"
            key={kind}
            disabled={running}
            onClick={() =>
              void action(
                `Reiniciar ${kind === "preferences" ? "preferências" : kind === "recents" ? "recentes" : kind === "session" ? "sessão anterior" : "assinaturas salvas"} mantendo um backup?`,
                async () => {
                  await window.api.preferences.repair(kind);
                  if (kind === "preferences") {
                    await loadPreferences();
                    setValue(usePreferences.getState().value);
                  }
                  if (kind === "recents")
                    useApp.setState({ recents: await window.api.recent.list() });
                  if (kind === "signatures")
                    useApp.setState({ signatures: await window.api.signatures.list() });
                },
              )
            }
          >
            {kind === "preferences"
              ? "Reiniciar preferências"
              : kind === "recents"
                ? "Reparar recentes"
                : kind === "session"
                  ? "Reparar sessão"
                  : "Reparar assinaturas"}
          </button>
        ))}
      </div>
    </Modal>
  );
}
