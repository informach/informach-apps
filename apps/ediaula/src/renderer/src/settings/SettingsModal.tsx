import {
  type AiClientId,
  type AiClientStatus,
  type AiSettingsView,
  ASSISTANT_MODELS,
  type AssistantEngine,
  ENGINE_LABEL,
} from "@shared/types";
import {
  Bot,
  Check,
  CircleAlert,
  Copy,
  KeyRound,
  Loader,
  Plug,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useApp } from "@/state/app";
import { Button, IconButton, Modal, Toggle } from "@/ui";

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  return [
    copied,
    (key, text) => {
      void navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    },
  ];
}

export function SettingsModal(): ReactNode {
  const close = (): void => {
    useApp.getState().set({ settingsOpen: false });
  };
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [clients, setClients] = useState<AiClientStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [copied, copy] = useCopy();

  const refreshClients = useCallback((): void => {
    void window.api.aiClients().then(setClients);
  }, []);
  useEffect(() => {
    void window.api.aiSettings().then(setView);
    refreshClients();
  }, [refreshClients]);

  const save = async (changes: Parameters<typeof window.api.saveAiSettings>[0]): Promise<void> => {
    setView(await window.api.saveAiSettings(changes));
  };

  const connect = async (id: AiClientId): Promise<void> => {
    setBusy(id);
    setNote(null);
    const r = await window.api.connectAiClient(id);
    setNote({ tone: r.ok ? "ok" : "err", text: r.message });
    setBusy(null);
    refreshClients();
  };

  const saveKey = async (): Promise<void> => {
    if (!keyDraft.trim()) return;
    setBusy("key");
    setNote(null);
    await save({ apiKey: keyDraft.trim() });
    setKeyDraft("");
    const r = await window.api.testApiKey();
    setNote({ tone: r.ok ? "ok" : "err", text: r.message });
    setBusy(null);
  };

  const url = view?.mcpUrl ?? "";
  const desktopSnippet = JSON.stringify(
    { mcpServers: { ediaula: { command: "npx", args: ["-y", "mcp-remote", url] } } },
    null,
    2,
  );

  return (
    <Modal label="Configurações" onClose={close} width={760}>
      <div className="export-head">
        <Sparkles size={18} className="accent" />
        <div className="spacer">
          <h2 className="modal-title">Inteligência artificial</h2>
          <p className="muted">
            Use a sua assinatura do Claude ou do ChatGPT, ou uma chave da API.
          </p>
        </div>
        <IconButton icon={X} label="Fechar" onClick={close} />
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <div className="settings-title">
            <Bot size={16} className="accent" />
            <div className="spacer">
              <strong>Quem responde no chat do Assistente</strong>
              <p className="muted">
                Com Claude Code ou Codex, o chat usa a sua assinatura: o EdiAula roda o programa
                oficial já logado no seu computador, sem ver a sua senha, e ele só enxerga as
                ferramentas de edição (sem acesso a arquivos ou terminal).
              </p>
            </div>
          </div>
          <div className="engine-list">
            {(["claude-code", "codex", "api"] as AssistantEngine[]).map((id) => {
              const client = clients?.find((c) => c.id === id);
              const available = id === "api" ? !!view?.hasApiKey : !!client?.installed;
              return (
                <button
                  type="button"
                  key={id}
                  className={`engine ${view?.engine === id ? "is-active" : ""}`}
                  onClick={() => void save({ engine: id })}
                >
                  <span className="radio" />
                  <span className="spacer">
                    <strong>{ENGINE_LABEL[id]}</strong>
                    <span className="muted">
                      {id === "api"
                        ? view?.hasApiKey
                          ? "Chave configurada abaixo"
                          : "Precisa de uma chave (abaixo)"
                        : clients === null
                          ? "Procurando…"
                          : available
                            ? (client?.version ?? "Instalado")
                            : "Não encontrado neste computador"}
                    </span>
                  </span>
                  {!available && clients !== null && (
                    <CircleAlert size={14} className="warn-icon" />
                  )}
                </button>
              );
            })}
          </div>
          {view?.engine === "claude-code" && (
            <label className="field">
              <span className="field-label">Modelo no Claude Code</span>
              <select
                className="select"
                value={view.claudeModel}
                onChange={(e) => void save({ claudeModel: e.target.value })}
              >
                <option value="default">O padrão da sua conta</option>
                <option value="opus">Opus (mais capaz)</option>
                <option value="sonnet">Sonnet (gasta menos da cota)</option>
              </select>
            </label>
          )}
        </section>

        <section className="settings-section">
          <div className="settings-title">
            <Plug size={16} className="accent" />
            <div className="spacer">
              <strong>Conectar ao Claude Code, Claude Desktop ou Codex</strong>
              <p className="muted">
                Igual ao pen: o EdiAula oferece as ferramentas de edição e o seu app de IA conversa
                com você usando a sua assinatura. As edições aparecem ao vivo aqui. Só programas
                deste computador conseguem se conectar.
              </p>
            </div>
            {view && (
              <Toggle
                on={view.mcpEnabled}
                onChange={(v) => void save({ mcpEnabled: v })}
                label="Permitir conexão"
              />
            )}
          </div>

          {view && (
            <div className={`mcp-status ${view.mcpRunning ? "is-on" : ""}`}>
              {view.mcpRunning ? <Check size={13} /> : <CircleAlert size={13} />}
              {view.mcpRunning ? (
                <>
                  Pronto em <code>{url}</code>
                </>
              ) : (
                (view.mcpError ?? "Conexão desligada.")
              )}
            </div>
          )}

          <div className="client-list">
            {(clients ?? []).map((c) => (
              <div key={c.id} className="client">
                <Terminal size={16} />
                <div className="spacer">
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {c.installed
                      ? `${c.version ?? "instalado"}${c.connected ? " · conectado ao EdiAula" : ""}`
                      : "Não encontrado neste computador"}
                  </span>
                </div>
                {c.connected && <span className="pill-ok">Conectado</span>}
                <Button
                  size="sm"
                  variant={c.connected ? "secondary" : "primary"}
                  disabled={!c.installed || !view?.mcpEnabled || busy !== null}
                  onClick={() => void connect(c.id)}
                >
                  {busy === c.id ? <Loader size={12} className="spin" /> : null}
                  {c.connected ? "Reconectar" : "Conectar"}
                </Button>
              </div>
            ))}
            {clients === null && (
              <div className="client muted">
                <Loader size={14} className="spin" /> Procurando Claude Code e Codex…
              </div>
            )}
          </div>

          <div className="client">
            <Terminal size={16} />
            <div className="spacer">
              <strong>Claude Code só com o EdiAula</strong>
              <span className="muted">
                Abre o seu Claude Code numa janela que só enxerga as ferramentas do editor: sem
                arquivos, terminal ou internet.
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !view?.mcpRunning || !clients?.find((c) => c.id === "claude-code")?.installed
              }
              onClick={async () => {
                const r = await window.api.openRestrictedClaude();
                setNote({ tone: r.ok ? "ok" : "err", text: r.message });
              }}
            >
              Abrir
            </Button>
          </div>

          <details className="manual">
            <summary>Claude Desktop e configuração manual</summary>
            <p className="muted">
              Claude Desktop: em Configurações › Desenvolvedor › Editar configuração, adicione
              (precisa do Node.js instalado):
            </p>
            <div className="snippet">
              <pre>{desktopSnippet}</pre>
              <button
                type="button"
                className="icon-btn"
                title="Copiar"
                onClick={() => copy("desktop", desktopSnippet)}
              >
                {copied === "desktop" ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <p className="muted">Pelo terminal:</p>
            {[
              `claude mcp add --transport http --scope user ediaula ${url}`,
              `codex mcp add ediaula --url ${url}`,
            ].map((cmd) => (
              <div key={cmd} className="snippet">
                <pre>{cmd}</pre>
                <button
                  type="button"
                  className="icon-btn"
                  title="Copiar"
                  onClick={() => copy(cmd, cmd)}
                >
                  {copied === cmd ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            ))}
          </details>
        </section>

        <section className="settings-section">
          <div className="settings-title">
            <KeyRound size={16} className="accent" />
            <div className="spacer">
              <strong>Assistente dentro do EdiAula (chave da API da Anthropic)</strong>
              <p className="muted">
                Habilita o chat na aba Assistente. Cobrado por uso na sua conta da API da Anthropic
                (console.anthropic.com), separado da assinatura do Claude. A chave fica
                criptografada neste computador.
              </p>
            </div>
          </div>
          <div className="row-10">
            <input
              className="input"
              type="password"
              placeholder={
                view?.hasApiKey
                  ? `Chave salva (${view.apiKeyHint}) — cole outra para trocar`
                  : "sk-ant-..."
              }
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveKey()}
            />
            <Button
              variant="primary"
              disabled={!keyDraft.trim() || busy !== null}
              onClick={() => void saveKey()}
            >
              {busy === "key" ? <Loader size={12} className="spin" /> : null}
              Salvar
            </Button>
            {view?.hasApiKey && (
              <Button variant="ghost" onClick={() => void save({ apiKey: null })}>
                Remover
              </Button>
            )}
          </div>
          <label className="field">
            <span className="field-label">Modelo</span>
            <select
              className="select"
              value={view?.model ?? ""}
              onChange={(e) => void save({ model: e.target.value })}
            >
              {ASSISTANT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {note && (
          <p className={`settings-note ${note.tone === "ok" ? "is-ok" : "is-err"}`}>{note.text}</p>
        )}
      </div>
    </Modal>
  );
}
