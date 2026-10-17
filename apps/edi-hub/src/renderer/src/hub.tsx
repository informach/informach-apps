import { EDI_TOOL_BRAND, type EdiGlyphShape } from "@informach/config/edi-brand";
import { EDI_TOOLS, type EdiToolId } from "@informach/config/edi-tools";
import { formatDeviceUserCode } from "@informach/edi-contracts/device-code";
import type { DesktopStatus } from "@informach/edi-desktop/contracts";
import { useEffect, useRef, useState } from "react";
import type { InstallActivity, Installation } from "../../shared/hub";
import { describeAccess, hubUpdateNotice, restrictedPanel } from "./access-copy";
import { failureMessage, type HubAction } from "./failure-copy";
import { installationAction } from "./installation-action";

/** Session operations change the same vault, so only one of them runs at a time. */
const SESSION_ACTIONS = ["connect", "logout", "refresh"];

function useHub() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [tools, setTools] = useState<Installation[]>([]);
  const [activity, setActivity] = useState<InstallActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Busy is tracked per action and per tool: installing one tool keeps the others usable.
  const running = useRef(new Set<string>());
  const [busy, setBusy] = useState<readonly string[]>([]);
  useEffect(() => {
    let mounted = true;
    const stopStatus = window.ediSuite.onStatus((next) => {
      if (mounted) setStatus(next);
    });
    const stopActivity = window.ediHub.onActivity((next) => {
      if (mounted) setActivity(next);
    });
    window.ediSuite
      .status()
      .then((next) => {
        if (mounted) setStatus(next);
      })
      .catch(() => {
        if (mounted) setError("Não foi possível consultar a sessão.");
      });
    window.ediHub
      .list()
      .then((next) => {
        if (mounted) setTools(next);
      })
      .catch(() => {
        if (mounted)
          setError("O catálogo de ferramentas está fora do ar agora. Tente de novo em instantes.");
      });
    return () => {
      mounted = false;
      stopStatus();
      stopActivity();
    };
  }, []);
  /**
   * `failure` names the copy shown when the action fails. Without it the outcome is
   * already on screen: session actions update the status, installs update the card.
   */
  async function run(name: string, action: () => Promise<void>, failure?: HubAction) {
    if (running.current.has(name)) return;
    running.current.add(name);
    setBusy([...running.current]);
    setError(null);
    try {
      await action();
    } catch (cause) {
      if (failure) setError(failureMessage(failure, cause));
    } finally {
      running.current.delete(name);
      setBusy([...running.current]);
    }
  }
  async function toolAction(id: EdiToolId) {
    const tool = tools.find((item) => item.id === id);
    if (installationAction(tool) === "open") {
      await run(id, () => window.ediHub.open(id), "open");
      return;
    }
    await run(id, async () => {
      try {
        await window.ediHub.install(id);
      } finally {
        setTools(await window.ediHub.list());
      }
    });
  }
  const isBusy = (name: string) => busy.includes(name);
  const sessionBusy = SESSION_ACTIONS.some(isBusy);
  return { status, tools, activity, error, isBusy, sessionBusy, run, toolAction };
}

function Glyph({ shapes }: { shapes: readonly EdiGlyphShape[] }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes.map((shape, index) => {
        const key = `${shape.kind}-${index}`;
        if (shape.kind === "path") return <path key={key} d={shape.d} />;
        if (shape.kind === "circle")
          return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        return (
          <rect
            key={key}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.rx}
          />
        );
      })}
    </svg>
  );
}

function SuiteBars() {
  return (
    <span className="bars" aria-hidden="true">
      {EDI_TOOLS.map((tool) => (
        <span
          key={tool.id}
          className="bars__bar"
          style={{ backgroundColor: EDI_TOOL_BRAND[tool.id].color }}
        />
      ))}
    </span>
  );
}

function portalHost(uri: string | null) {
  if (!uri) return "o site da Suíte Edi";
  const url = new URL(uri);
  return `${url.host}${url.pathname}`;
}

export function Hub() {
  const { status, tools, activity, error, isBusy, sessionBusy, run, toolAction } = useHub();
  const licensed = status?.state === "licensed";
  const hasSession = Boolean(status?.userId);
  const access = describeAccess(status);
  const panel = restrictedPanel(access, hasSession);
  const updateNotice = hubUpdateNotice(status?.update);
  const installedCount = tools.filter((tool) => tool.installed).length;
  const [copied, setCopied] = useState(false);
  return (
    <div className="hub">
      <aside className="rail mat">
        <span className="wordmark">
          <span className="wordmark__text">edi</span>
          <SuiteBars />
        </span>
        <nav className="rail__nav" aria-label="Edi Hub">
          <a href="#ferramentas" aria-current="page">
            Ferramentas
          </a>
          <button
            type="button"
            disabled={isBusy("updates")}
            onClick={() => {
              void run("updates", window.ediSuite.checkUpdate, "updates");
            }}
          >
            Atualizações
            {status?.update === "ready" && <span className="rail__badge">1</span>}
          </button>
          <button
            type="button"
            disabled={isBusy("account")}
            onClick={() => {
              void run("account", window.ediSuite.account, "account");
            }}
          >
            Minha assinatura <span aria-hidden="true">↗</span>
          </button>
        </nav>
        <section className={`account-card account-card--${access.tone}`} aria-live="polite">
          <strong className="account-card__title">{access.title}</strong>
          {access.detail && <p>{access.detail}</p>}
          {hasSession && (
            <span className="account-card__links">
              <button
                type="button"
                className="link-button"
                disabled={sessionBusy}
                onClick={() => {
                  void run("refresh", window.ediSuite.refresh);
                }}
              >
                Verificar acesso
              </button>
              <button
                type="button"
                className="link-button"
                disabled={sessionBusy}
                onClick={() => {
                  void run("logout", window.ediSuite.logout, "logout");
                }}
              >
                Sair deste computador
              </button>
            </span>
          )}
        </section>
      </aside>

      <main id="ferramentas" className="workspace">
        <header className="workspace__head">
          <div>
            <p className="eyebrow">Sua bancada</p>
            <h1>O que vamos criar hoje?</h1>
          </div>
          {tools.length > 0 && (
            <span className="mono muted">
              {installedCount} de {EDI_TOOLS.length} instaladas
            </span>
          )}
        </header>

        {updateNotice && (
          <p className="notice" role="status">
            {updateNotice}
          </p>
        )}
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        {status && !licensed && (
          <section className="connect" aria-labelledby="conectar">
            {status.state === "connecting" && status.userCode ? (
              <>
                <div className="connect__copy">
                  <h2 id="conectar">Vamos conectar sua conta.</h2>
                  <ol>
                    <li>
                      <strong>Abrimos o navegador para você.</strong>
                      <span>
                        Página {portalHost(status.verificationUri)}. Entre com a sua conta Edi.
                      </span>
                    </li>
                    <li>
                      <strong>Digite o código ao lado e autorize.</strong>
                      <span>Confira se é o mesmo que aparece aqui.</span>
                    </li>
                  </ol>
                </div>
                <div className="connect__code mat">
                  <span className="eyebrow">Seu código</span>
                  <strong className="code">{formatDeviceUserCode(status.userCode)}</strong>
                  <button
                    type="button"
                    className="button button--on-mat"
                    onClick={() => {
                      const code = status.userCode ?? "";
                      navigator.clipboard.writeText(code).then(
                        () => setCopied(true),
                        () => setCopied(false),
                      );
                    }}
                  >
                    {copied ? "Código copiado" : "Copiar código"}
                  </button>
                  <p role="status">Esperando você autorizar no navegador</p>
                  <span className="mono">vale por 10 minutos · depois é só pedir outro</span>
                </div>
              </>
            ) : (
              <div className="connect__copy">
                <h2 id="conectar">{access.heading}</h2>
                <p>
                  {status.cause === "signed_out" && !hasSession
                    ? "O Hub abre o navegador para você entrar e mostra um código para confirmar que este computador é seu."
                    : status.reason}
                </p>
                <span className="actions">
                  {panel.primary === "subscription" || panel.primary === "devices" ? (
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={isBusy("account")}
                      onClick={() => {
                        void run("account", window.ediSuite.account, "account");
                      }}
                    >
                      {panel.primary === "devices" ? "Gerenciar computadores" : "Minha assinatura"}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                  ) : panel.primary === "update" ? (
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={isBusy("updates")}
                      onClick={() => {
                        void run("updates", window.ediSuite.checkUpdate, "updates");
                      }}
                    >
                      Buscar atualização
                    </button>
                  ) : panel.primary === "retry" ? (
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={sessionBusy}
                      onClick={() => {
                        void run("refresh", window.ediSuite.refresh);
                      }}
                    >
                      Verificar de novo
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={
                      panel.primary === "connect"
                        ? "button button--primary"
                        : "button button--outline"
                    }
                    disabled={sessionBusy || status.state === "connecting"}
                    onClick={() => {
                      setCopied(false);
                      void run("connect", window.ediSuite.connect);
                    }}
                  >
                    {status.state === "connecting" ? "Abrindo o navegador…" : panel.connectLabel}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                  {panel.retry && (
                    <button
                      type="button"
                      className="button button--outline"
                      disabled={sessionBusy}
                      onClick={() => {
                        void run("refresh", window.ediSuite.refresh);
                      }}
                    >
                      Verificar de novo
                    </button>
                  )}
                </span>
                {panel.signOut && (
                  <button
                    type="button"
                    className="link-button connect__signout"
                    disabled={sessionBusy}
                    onClick={() => {
                      void run("logout", window.ediSuite.logout, "logout");
                    }}
                  >
                    Sair deste computador
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        <section className="tool-grid" aria-label="Ferramentas">
          {EDI_TOOLS.map((tool) => {
            const installation = tools.find((item) => item.id === tool.id);
            const action = installationAction(installation);
            const progress = activity.find((item) => item.id === tool.id);
            const percent = progress ? Math.round(progress.progress * 100) : 0;
            return (
              <article
                key={tool.id}
                className={installation?.installed ? "tool" : "tool tool--missing"}
              >
                <div className="tool__top">
                  <span
                    className="tool__icon"
                    style={{ backgroundColor: EDI_TOOL_BRAND[tool.id].color }}
                  >
                    <Glyph shapes={EDI_TOOL_BRAND[tool.id].glyph} />
                  </span>
                  {progress ? (
                    <span className="mono muted">
                      {progress.phase === "installing" ? "instalando" : `${percent}%`}
                    </span>
                  ) : action === "update" ? (
                    <span className="badge">versão nova</span>
                  ) : (
                    <span className="mono muted">
                      {installation?.version ? `v${installation.version}` : "não instalada"}
                    </span>
                  )}
                </div>
                <h2>{tool.name}</h2>
                <p>{tool.description}</p>
                {progress ? (
                  <div className="tool__progress">
                    <div
                      className="progress"
                      role="progressbar"
                      aria-label={`Instalação do ${tool.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      // While the installer runs the bar is indeterminate: no value to announce.
                      aria-valuenow={progress.phase === "installing" ? undefined : percent}
                      aria-valuetext={progress.phase === "installing" ? "Instalando" : undefined}
                    >
                      <span
                        className={
                          progress.phase === "installing"
                            ? "progress__fill progress__fill--working"
                            : "progress__fill"
                        }
                        style={{ width: `${progress.phase === "installing" ? 100 : percent}%` }}
                      />
                    </div>
                    <small>
                      {progress.phase === "installing"
                        ? "Instalando. Pode continuar usando as outras."
                        : "Baixando. Pode continuar usando as outras."}
                    </small>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={action === "open" ? "button button--ink" : "button button--outline"}
                    disabled={
                      isBusy(tool.id) ||
                      (action !== "open" && !installation?.available) ||
                      (action === "open" && !licensed)
                    }
                    onClick={() => {
                      void toolAction(tool.id);
                    }}
                  >
                    {isBusy(tool.id)
                      ? "Aguarde…"
                      : action === "open"
                        ? "Abrir"
                        : action === "update"
                          ? "Atualizar"
                          : "Instalar"}
                  </button>
                )}
                {installation?.error && (
                  <p className="tool__error" role="status">
                    {installation.error}
                  </p>
                )}
              </article>
            );
          })}
          <article className="tool tool--note mat">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
              <path d="M8.5 12l2.5 2.5 4.5-5" />
            </svg>
            <h2>Seu trabalho é seu.</h2>
            <p>
              Os projetos ficam neste computador. Nenhuma ferramenta aberta é fechada para
              atualizar.
            </p>
          </article>
        </section>

        <footer className="workspace__foot mono">
          <span>Edi Hub · Windows 64 bits</span>
          <span>
            {status?.update === "development"
              ? "Build de desenvolvimento, sem atualização automática"
              : "Atualizações automáticas ligadas"}
          </span>
        </footer>
      </main>
    </div>
  );
}
