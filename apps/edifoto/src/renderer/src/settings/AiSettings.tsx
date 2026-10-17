import { showModalOnMount } from "@informach/edi-desktop/renderer";
import {
  type AiClientStatus,
  type AiSettingsChanges,
  type AiSettingsView,
  API_MODELS,
  type AssistantEngine,
} from "@shared/types";
import {
  Check,
  Copy,
  KeyRound,
  Loader,
  MessageSquare,
  Monitor,
  Plug,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Terminal,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useUi } from "@/state/ui";
import { Toggle } from "@/ui/controls";

export function AiSettings(): ReactNode {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [clients, setClients] = useState<AiClientStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [key, setKey] = useState("");
  const [desktopGuide, setDesktopGuide] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void window.api.aiSettings().then(setView);
    void window.api.aiClients().then(setClients);
  }, []);

  const close = (): void => {
    useUi.setState({ settingsOpen: false });
    void useUi.getState().refreshAi();
  };
  const save = async (changes: AiSettingsChanges): Promise<void> => {
    try {
      const v = await window.api.saveAiSettings(changes);
      setView(v);
      useUi.setState({ ai: v });
    } catch (err) {
      setNote({ tone: "err", text: (err as Error).message });
    }
  };
  const copy = (id: string, text: string): void => {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };
  const connect = async (id: AiClientStatus["id"]): Promise<void> => {
    setBusy(id);
    const r = await window.api.connectAiClient(id);
    setNote({ tone: r.ok ? "ok" : "err", text: r.message });
    setClients(await window.api.aiClients());
    setBusy(null);
  };

  const url = view?.mcpUrl ?? "";
  const desktopSnippet = JSON.stringify(
    { mcpServers: { edifoto: { command: "npx", args: ["-y", "mcp-remote", url] } } },
    null,
    2,
  );
  const engines: { id: AssistantEngine; name: string; desc: string }[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      desc: "Sua assinatura Claude · roda no seu computador",
    },
    { id: "codex", name: "Codex", desc: "Sua assinatura ChatGPT · roda no seu computador" },
    {
      id: "api",
      name: "Chave da API Anthropic",
      desc: view?.hasApiKey
        ? `Paga por uso · chave ${view.apiKeyHint}`
        : "Paga por uso, direto na sua conta da Anthropic",
    },
  ];
  const clientIcon = (id: string): ReactNode =>
    id === "claude-code" ? <SquareTerminal size={16} /> : <Terminal size={16} />;

  return (
    <dialog
      ref={showModalOnMount}
      aria-label="Configurações de inteligência artificial"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        maxWidth: "none",
        maxHeight: "none",
        width: "100vw",
        height: "100vh",
      }}
      className="backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <Sparkles size={18} className="accent" />
          <strong>Inteligência artificial</strong>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={close}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <section className="ai-section">
            <div className="ai-title">
              <Plug size={16} />
              <div>
                <strong>Conectar um agente externo</strong>
                <p className="muted">
                  Use o Claude Code, o Claude Desktop ou o Codex com a sua própria assinatura. Você
                  conversa lá e vê as edições acontecendo aqui, igual ao pen.
                </p>
              </div>
            </div>
            <div className="toggle-row">
              Permitir conexão de agentes (servidor MCP local)
              <Toggle
                on={view?.mcpEnabled ?? true}
                onChange={(v) => void save({ mcpEnabled: v })}
              />
            </div>
            {view && (
              <div className={`mcp-status${view.mcpRunning ? " is-on" : ""}`}>
                <span className="dot" />
                {view.mcpRunning ? (
                  <>
                    Servidor MCP ativo em <code>{url}</code>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="icon-btn"
                      title="Copiar endereço"
                      onClick={() => copy("url", url)}
                    >
                      {copied === "url" ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </>
                ) : (
                  (view.mcpError ?? "Conexão desligada.")
                )}
              </div>
            )}
            {(
              clients ?? [
                { id: "claude-code", name: "Claude Code", installed: false, connected: false },
                { id: "codex", name: "Codex", installed: false, connected: false },
              ]
            ).map((c) => (
              <div key={c.id} className="choice">
                {clientIcon(c.id)}
                <div className="choice-text">
                  <strong>{c.name}</strong>
                  <span>
                    {!clients
                      ? "Procurando…"
                      : !c.installed
                        ? c.id === "codex"
                          ? "Não encontrado. Instale com: npm install -g @openai/codex"
                          : "Não encontrado. Instale em claude.com/code"
                        : `${c.version ?? "instalado"} · ${c.id === "codex" ? "assinatura ChatGPT" : "assinatura Claude"}`}
                  </span>
                </div>
                {c.connected ? (
                  <span className="pill-ok">
                    <Check size={11} /> Configurado
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={!c.installed || !view?.mcpRunning || busy !== null}
                    onClick={() => void connect(c.id)}
                  >
                    {busy === c.id ? <Loader size={13} className="spin" /> : null} Conectar
                  </button>
                )}
              </div>
            ))}
            <div className="choice">
              <Monitor size={16} />
              <div className="choice-text">
                <strong>Claude Desktop</strong>
                <span>
                  Configurações › Desenvolvedor › Editar configuração (precisa do Node.js)
                </span>
              </div>
              <button type="button" className="btn" onClick={() => setDesktopGuide(!desktopGuide)}>
                <Plug size={13} /> Conectar
              </button>
            </div>
            {desktopGuide && (
              <div className="section">
                <strong>Conectar o Claude Desktop</strong>
                <ol>
                  <li>
                    Abra Configurações → Desenvolvedor → Editar configuração no Claude Desktop.
                  </li>
                  <li>
                    Adicione a entrada edifoto em mcpServers, preservando os outros servidores.
                  </li>
                  <li>
                    Salve, reinicie o Claude Desktop e peça para consultar o documento aberto.
                  </li>
                </ol>
                <div className="snippet">
                  <pre>{desktopSnippet}</pre>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => copy("desktop", desktopSnippet)}
                  >
                    {copied === "desktop" ? "Copiado" : "Copiar JSON"}
                  </button>
                </div>
                <span className="hint">
                  Mantenha o EdiFoto aberto. A execução de uma ferramenta aparece na barra de
                  status.
                </span>
              </div>
            )}
            <details>
              <summary>Configuração manual (JSON / TOML)</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {[
                  desktopSnippet,
                  `[mcp_servers.edifoto]\nurl = "${url}"`,
                  `claude mcp add --transport http --scope user edifoto ${url}`,
                  `codex mcp add edifoto --url ${url}`,
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
              </div>
            </details>
          </section>

          <section className="ai-section">
            <div className="ai-title">
              <MessageSquare size={16} />
              <div>
                <strong>Chat dentro do EdiFoto</strong>
                <p className="muted">
                  Escolha quem responde no painel Assistente. Nada é enviado sem você pedir.
                </p>
              </div>
            </div>
            {engines.map((e) => (
              <button
                type="button"
                key={e.id}
                className={`choice${view?.engine === e.id ? " is-active" : ""}`}
                onClick={() => void save({ engine: e.id })}
              >
                <span className="radio" />
                <div className="choice-text">
                  <strong>{e.name}</strong>
                  <span>{e.desc}</span>
                </div>
              </button>
            ))}
            {view?.engine === "api" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="row">
                  <input
                    className="field grow"
                    type="password"
                    placeholder={
                      view.hasApiKey
                        ? `Chave salva (${view.apiKeyHint}) — cole outra para trocar`
                        : "Cole a chave da API (sk-ant-…)"
                    }
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!key.trim()}
                    onClick={async () => {
                      await save({ apiKey: key });
                      setKey("");
                      setNote(
                        await window.api
                          .testApiKey()
                          .then((r) => ({ tone: r.ok ? "ok" : "err", text: r.message })),
                      );
                    }}
                  >
                    <KeyRound size={13} /> Salvar
                  </button>
                  {view.hasApiKey && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void save({ apiKey: null })}
                    >
                      Apagar
                    </button>
                  )}
                </div>
                <div className="row">
                  <span className="muted" style={{ fontSize: 12 }}>
                    Modelo
                  </span>
                  <select
                    className="field grow"
                    value={view.model}
                    onChange={(e) => void save({ model: e.target.value })}
                  >
                    {API_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          <section className="ai-section">
            <div className="ai-title">
              <ShieldCheck size={16} />
              <div>
                <strong>O que o agente pode fazer</strong>
                <p className="muted">
                  Toda ação do agente entra no Histórico e pode ser desfeita com Ctrl+Z.
                </p>
              </div>
            </div>
            <div className="toggle-row">
              Pedir confirmação antes de apagar camadas
              <Toggle
                on={view?.confirmDeletes ?? true}
                onChange={(v) => void save({ confirmDeletes: v })}
              />
            </div>
            <div className="toggle-row">
              Permitir exportar e salvar arquivos
              <Toggle
                on={view?.allowFileWrites ?? false}
                onChange={(v) => void save({ allowFileWrites: v })}
              />
            </div>
          </section>

          {note && <p className={`note ${note.tone === "ok" ? "is-ok" : "is-err"}`}>{note.text}</p>}
        </div>
        <div className="modal-foot">
          <span
            className="muted"
            style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}
          >
            <KeyRound size={12} /> Chaves ficam criptografadas neste computador.
          </span>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={close}>
            Concluído
          </button>
        </div>
      </div>
    </dialog>
  );
}
