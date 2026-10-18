import {
  ASSISTANT_MODELS,
  EARLIER_MODELS,
  EFFORTS,
  type Effort,
  modelLabel,
} from "@shared/aiModels";
import {
  type AiClientId,
  type AiClientStatus,
  type AiGrantView,
  type AiSettingsView,
  type AssistantEngine,
  ENGINE_LABEL,
} from "@shared/types";
import {
  Bot,
  Check,
  CircleAlert,
  Copy,
  HardDrive,
  KeyRound,
  Loader,
  Plug,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { bytes } from "@/lib/format";
import { useApp } from "@/state/app";
import { Button, IconButton, Modal, Toggle } from "@/ui";

/** mcp-remote version shown in the Claude Desktop snippet (fixed, so it never changes by itself). */
const MCP_REMOTE = "mcp-remote@0.15.1";

const CLIENT_LABEL: Record<string, string> = {
  "claude-code": "Claude Code (Conectar)",
  codex: "Codex (Conectar)",
  manual: "Configuração manual",
  legacy: "Conexão de uma versão anterior",
  painel: "Chat do Assistente (só durante a conversa)",
  "claude-restrito": "Claude Code só com o EdiAula (enquanto a janela estiver aberta)",
};

const SCOPE_LABEL: Record<AiGrantView["scopes"][number], string> = {
  read: "ler",
  propose: "propor",
  write: "alterar",
};

const when = (ms: number): string =>
  new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

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

/** What each engine can reach, said plainly. */
function engineNote(id: AssistantEngine, view: AiSettingsView | null): string {
  if (id === "api")
    return "Roda aqui dentro com a sua chave: o modelo só vê as ferramentas de edição do EdiAula.";
  if (id === "claude-code")
    return "Roda o Claude Code oficial já logado neste computador, sem as ferramentas próprias dele (arquivos, terminal e internet): só as ferramentas de edição do EdiAula. A sua senha não passa pelo EdiAula.";
  const check = view?.codexRestricted;
  if (!check)
    return "Roda o Codex oficial com terminal, mudança de arquivos e busca na internet desligados. Antes da primeira conversa, o EdiAula confere se ele fica só nas ferramentas de edição.";
  if (check.ok)
    return `Roda o Codex oficial com terminal, mudança de arquivos e busca na internet desligados. Conferido nesta versão (${check.version}): ele fica só nas ferramentas de edição, e o EdiAula interrompe a conversa se ele tentar sair delas.`;
  return `Sem restrição garantida: nesta versão (${check.version}) o Codex não ficou só nas ferramentas de edição na conferência. Ele pode tentar ler arquivos do computador; o EdiAula interrompe a conversa quando percebe, mas não garante.`;
}

export function SettingsModal(): ReactNode {
  const close = (): void => {
    useApp.getState().set({ settingsOpen: false });
  };
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [clients, setClients] = useState<AiClientStatus[] | null>(null);
  const [grants, setGrants] = useState<AiGrantView[]>([]);
  const [manual, setManual] = useState<{ token: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [copied, copy] = useCopy();

  const refreshClients = useCallback((): void => {
    void window.api.aiClients().then(setClients);
    void window.api.aiGrants().then(setGrants);
  }, []);
  useEffect(() => {
    void window.api.aiSettings().then(setView);
    refreshClients();
  }, [refreshClients]);

  const save = async (changes: Parameters<typeof window.api.saveAiSettings>[0]): Promise<void> => {
    setView(await window.api.saveAiSettings(changes));
  };

  /** Conectar keeps a working token; Reconectar (`rotate`) replaces it. */
  const connect = async (id: AiClientId, rotate = false): Promise<void> => {
    setBusy(id);
    setNote(null);
    const r = await window.api.connectAiClient(id, rotate);
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

  const checkCodex = async (): Promise<void> => {
    setBusy("codex-check");
    setNote(null);
    const next = await window.api.codexSelfTest();
    setView(next);
    setBusy(null);
    setNote(
      next.codexRestricted
        ? {
            tone: next.codexRestricted.ok ? "ok" : "err",
            text: next.codexRestricted.ok
              ? "O Codex ficou só nas ferramentas de edição."
              : "O Codex não ficou só nas ferramentas de edição nesta versão.",
          }
        : { tone: "err", text: "A conferência não terminou. Confira se o Codex está logado." },
    );
  };

  const revoke = async (id: string): Promise<void> => {
    await window.api.revokeAiGrant(id);
    refreshClients();
  };

  const makeManualToken = async (): Promise<void> => {
    setManual(await window.api.createManualAiToken());
    refreshClients();
  };

  const url = view?.mcpUrl ?? "";
  const token = manual?.token ?? "<token>";
  const snippets = [
    {
      key: "claude",
      label: "Claude Code, pelo terminal:",
      text: `claude mcp add --transport http --scope user ediaula ${url} --header "Authorization: Bearer ${token}"`,
    },
    {
      key: "codex",
      label: "Codex, no arquivo .codex\\config.toml da sua pasta de usuário:",
      text: `[mcp_servers.ediaula]\nurl = "${url}"\nhttp_headers = { Authorization = "Bearer ${token}" }`,
    },
    {
      key: "desktop",
      label:
        "Claude Desktop: em Configurações › Desenvolvedor › Editar configuração, adicione (precisa do Node.js instalado):",
      text: JSON.stringify(
        {
          mcpServers: {
            ediaula: {
              command: "npx",
              args: ["-y", MCP_REMOTE, url, "--header", `Authorization:\${EDIAULA_AUTH}`],
              env: { EDIAULA_AUTH: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
    },
  ];
  const engine = view?.engine;
  const models = [...ASSISTANT_MODELS, ...EARLIER_MODELS.filter((m) => m.id === view?.model)];

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
                oficial já logado no seu computador, sem ver a sua senha.
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
                  className={`engine ${engine === id ? "is-active" : ""}`}
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
          {engine && <p className="muted small">{engineNote(engine, view)}</p>}
          {engine === "codex" && (
            <div className="row-10">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null || !clients?.find((c) => c.id === "codex")?.installed}
                onClick={() => void checkCodex()}
              >
                {busy === "codex-check" ? <Loader size={12} className="spin" /> : null}
                {view?.codexRestricted ? "Conferir de novo" : "Conferir agora"}
              </Button>
              {view?.codexRestricted && !view.codexRestricted.ok && (
                <Toggle
                  on={view.codexConfirmed}
                  onChange={(v) => void save({ codexConfirmed: v })}
                  label="Usar o Codex mesmo sem a restrição garantida"
                />
              )}
            </div>
          )}
          {engine === "claude-code" && (
            <label className="field">
              <span className="field-label">Modelo no Claude Code</span>
              <select
                className="select"
                value={view?.claudeModel}
                onChange={(e) => void save({ claudeModel: e.target.value })}
              >
                <option value="default">O padrão da sua conta</option>
                <option value="opus">Opus (mais capaz)</option>
                <option value="sonnet">Sonnet (gasta menos da cota)</option>
              </select>
            </label>
          )}
          {(engine === "claude-code" || engine === "api") && view && (
            <label className="field">
              <span className="field-label">Esforço do raciocínio</span>
              <select
                className="select"
                value={view.effort}
                onChange={(e) => void save({ effort: e.target.value as Effort })}
              >
                {EFFORTS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
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
                deste computador conseguem se conectar. Cada app conectado pode ler a aula e propor
                cortes; para alterar a aula, ele pede a sua permissão aqui no EdiAula.
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
                  title={
                    c.connected
                      ? "Troca o acesso deste app. Depois, feche e abra o app para ele usar o novo."
                      : undefined
                  }
                  onClick={() => void connect(c.id, c.connected)}
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
                refreshClients();
              }}
            >
              Abrir
            </Button>
          </div>

          <div className="settings-title">
            <ShieldCheck size={16} className="accent" />
            <div className="spacer">
              <strong>Conexões com acesso</strong>
              <p className="muted">
                Quem pode falar com o EdiAula agora. Revogue o que você não usa mais; sair da conta
                Edi neste computador revoga todas.
              </p>
            </div>
          </div>
          <div className="client-list">
            {grants.length === 0 && <div className="client muted">Nenhuma conexão ativa.</div>}
            {grants.map((g) => (
              <div key={g.id} className="client">
                <KeyRound size={16} />
                <div className="spacer">
                  <strong>{CLIENT_LABEL[g.client] ?? g.client}</strong>
                  <span className="muted">
                    Pode {g.scopes.map((s) => SCOPE_LABEL[s]).join(", ")} · criada{" "}
                    {when(g.createdAt)}
                    {g.lastUsedAt ? ` · usada ${when(g.lastUsedAt)}` : " · ainda não usada"}
                    {g.expiresAt ? ` · vale até ${when(g.expiresAt)}` : ""}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void revoke(g.id)}>
                  Revogar
                </Button>
              </div>
            ))}
          </div>

          <details className="manual">
            <summary>Claude Desktop e configuração manual</summary>
            <p className="muted">
              Gere um token próprio para configurar à mão. Ele pode ler a aula e propor cortes; as
              alterações pedem a sua permissão. Guarde-o como uma senha e revogue quando não usar
              mais.
            </p>
            <Button
              size="sm"
              variant={manual ? "secondary" : "primary"}
              disabled={!view?.mcpRunning}
              onClick={() => void makeManualToken()}
            >
              {manual ? "Gerar outro token" : "Gerar token para configuração manual"}
            </Button>
            {manual && (
              <p className="muted small">
                O token aparece só agora. Se perder, gere outro e revogue este na lista acima.
              </p>
            )}
            {snippets.map((s) => (
              <div key={s.key}>
                <p className="muted">{s.label}</p>
                <div className="snippet">
                  <pre>{s.text}</pre>
                  <button
                    type="button"
                    className="icon-btn"
                    title={manual ? "Copiar" : "Gere o token primeiro"}
                    disabled={!manual}
                    onClick={() => copy(s.key, s.text)}
                  >
                    {copied === s.key ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
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
                criptografada neste computador, e o custo de cada pedido aparece no chat.
              </p>
            </div>
          </div>
          <div className="row-10">
            <input
              className="input"
              type="password"
              placeholder={
                view?.hasApiKey
                  ? `Chave salva (${view.apiKeyHint}): cole outra para trocar`
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
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {view?.modelNotice && (
            <p className="muted small">
              <CircleAlert size={11} /> {view.modelNotice}
            </p>
          )}
          {view && !view.modelNotice && (
            <p className="muted small">Em uso: {modelLabel(view.model)}.</p>
          )}
        </section>

        <ExportCacheSection />

        {note && (
          <p className={`settings-note ${note.tone === "ok" ? "is-ok" : "is-err"}`}>{note.text}</p>
        )}
      </div>
    </Modal>
  );
}

/** The reusable export segments: they make the next export of a lesson fast, and take disk. */
function ExportCacheSection(): ReactNode {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const clear = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const freed = await window.api.clearExportCache();
      setResult({
        tone: "ok",
        text: freed ? `${bytes(freed)} liberados.` : "O cache já estava vazio.",
      });
    } catch (error) {
      setResult({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-section">
      <div className="settings-title">
        <HardDrive size={16} className="accent" />
        <div className="spacer">
          <strong>Cache de exportação</strong>
          <p className="muted">
            Os trechos já exportados ficam guardados (até 15 GB) e são reaproveitados quando a aula
            é exportada de novo: só o que mudou é refeito. Limpar libera o espaço; a próxima
            exportação refaz tudo.
          </p>
        </div>
      </div>
      <div className="row-10">
        <Button variant="secondary" disabled={busy} onClick={() => void clear()}>
          {busy ? <Loader size={12} className="spin" /> : null}
          Limpar cache de exportação
        </Button>
        {result && (
          <span className={`settings-note ${result.tone === "ok" ? "is-ok" : "is-err"}`}>
            {result.text}
          </span>
        )}
      </div>
    </section>
  );
}
