import { showModalOnMount } from "@informach/edi-desktop/renderer";
import type { AiClientStatus, AiSettingsChanges, AiSettingsView } from "@shared/types";
import { Check, Loader, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useUi } from "@/state/ui";
import { Toggle } from "@/ui/controls";

export function AiSettings(): ReactNode {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [clients, setClients] = useState<AiClientStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    void Promise.all([window.api.aiSettings(), window.api.aiClients()])
      .then(([v, c]) => {
        setView(v);
        setClients(c);
      })
      .catch((error) => setNote(String(error)));
  }, []);
  const close = (): void => {
    useUi.setState({ settingsOpen: false });
    void useUi.getState().refreshAi();
  };
  const save = async (changes: AiSettingsChanges): Promise<void> => {
    setBusy(true);
    try {
      const value = await window.api.saveAiSettings(changes);
      setView(value);
      useUi.setState({ ai: value });
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const connect = async (id: AiClientStatus["id"]): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.api.connectAiClient(id);
      setNote(result.message);
      setClients(await window.api.aiClients());
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Configurações de inteligência artificial"
      className="backdrop"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <Sparkles size={18} />
          <strong>Inteligência artificial</strong>
          <span className="spacer" />
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar configurações"
            onClick={close}
          >
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <section className="ai-section">
            <strong>Use sua assinatura pessoal</strong>
            <p className="muted">
              Escolha Claude Code ou Codex, instalado e conectado ? sua conta neste computador. O
              EdiFoto não vende créditos de IA nem pede chave de API. Os limites e a disponibilidade
              seguem sua assinatura.
            </p>
            {(["claude-code", "codex"] as const).map((id) => {
              const client = clients.find((c) => c.id === id);
              return (
                <div key={id}>
                  <button
                    type="button"
                    className={`choice${view?.engine === id ? " is-active" : ""}`}
                    disabled={busy || !view}
                    onClick={() => void save({ engine: id })}
                  >
                    <span className="radio" />
                    <div className="choice-text">
                      <strong>{id === "codex" ? "Codex" : "Claude Code"}</strong>
                      <span>
                        {id === "codex" ? "Sua assinatura ChatGPT" : "Sua assinatura Claude"}
                      </span>
                    </div>
                    {view?.engine === id && <Check size={15} />}
                  </button>
                  <div className="row">
                    <span className="hint grow">
                      {!client
                        ? "Verificando instalação…"
                        : !client.installed
                          ? "Instale o cliente oficial e faça login com sua conta."
                          : client.connected
                            ? "Conexão configurada"
                            : "Cliente encontrado"}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || !client?.installed || !view?.mcpRunning}
                      onClick={() => void connect(id)}
                    >
                      {busy && <Loader size={12} className="spin" />}
                      {client?.connected ? "Reconectar" : "Conectar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
          <section className="ai-section">
            <strong>Controle das edições</strong>
            <p className="muted">
              Somente seus pedidos iniciam uma conversa. O assistente recebe a prévia e informações
              da imagem quando solicita suas ferramentas. As alterações ficam no Histórico.
            </p>
            <div className="toggle-row">
              Permitir conexão da IA
              <Toggle
                on={view?.mcpEnabled ?? true}
                onChange={(v) => void save({ mcpEnabled: v })}
              />
            </div>
            <div className="toggle-row">
              Confirmar antes de apagar camadas
              <Toggle
                on={view?.confirmDeletes ?? true}
                onChange={(v) => void save({ confirmDeletes: v })}
              />
            </div>
            <div className="toggle-row">
              Permitir exportação solicitada à IA
              <Toggle
                on={view?.allowFileWrites ?? false}
                onChange={(v) => void save({ allowFileWrites: v })}
              />
            </div>
            {view?.mcpError && <p role="alert">{view.mcpError}</p>}
            <details>
              <summary>Detalhes da conexão</summary>
              <p className="muted">
                {view?.mcpRunning ? "Conexão local ativa" : "Conexão local desligada"} ·{" "}
                {view?.mcpUrl}. O botão Conectar configura a autenticação local no cliente
                escolhido. A instalação e o login permanecem no cliente oficial.
              </p>
            </details>
          </section>
          {note && (
            <p className="note" role="status">
              {note}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={close}>
            Concluído
          </button>
        </div>
      </div>
    </dialog>
  );
}
