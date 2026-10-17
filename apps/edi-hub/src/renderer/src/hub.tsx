import { EDI_TOOLS, type EdiToolId } from "@informach/config/edi-tools";
import { PRODUCTS } from "@informach/config/products";
import type { DesktopStatus } from "@informach/edi-desktop/contracts";
import { useEffect, useState } from "react";
import type { Installation } from "../../shared/hub";
import { installationAction } from "./installation-action";

function useHub() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [tools, setTools] = useState<Installation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const stop = window.ediSuite.onStatus((next) => {
      if (mounted) setStatus(next);
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
          setError(
            "Nenhum catálogo disponível. A distribuição comercial ainda precisa ser configurada.",
          );
      });
    return () => {
      mounted = false;
      stop();
    };
  }, []);
  async function run(name: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Operação indisponível. Tente novamente.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function toolAction(id: EdiToolId) {
    const tool = tools.find((item) => item.id === id);
    await run(id, async () => {
      if (installationAction(tool) === "open") await window.ediHub.open(id);
      else {
        await window.ediHub.install(id);
        setTools(await window.ediHub.list());
      }
    });
  }
  return { status, tools, error, busy, run, toolAction };
}
export function Hub() {
  const { status, tools, error, busy, run, toolAction } = useHub();
  const licensed = status?.state === "licensed";
  return (
    <div className="hub">
      <aside className="rail">
        <div className="brand">
          edi<span>/</span>
        </div>
        <span className="rail-title">
          Sua bancada
          <br />
          criativa.
        </span>
        <nav aria-label="Suíte">
          <a href="#ferramentas" aria-current="page">
            Ferramentas
          </a>
          <button
            type="button"
            onClick={() => {
              void run("account", window.ediSuite.account);
            }}
          >
            Minha assinatura ↗
          </button>
          <button
            type="button"
            onClick={() => {
              void run("updates", window.ediSuite.checkUpdate);
            }}
          >
            Atualizações
          </button>
        </nav>
        <div className="rail-foot">
          Aula · Captura · Foto
          <br />
          PDF · SVG
          <br />
          <small>Suíte Edi para Windows</small>
        </div>
      </aside>
      <main id="ferramentas">
        <header className="topline">
          <span>ESPAÇO DE CRIAÇÃO</span>
          <span className={`badge ${licensed ? "valid" : ""}`}>
            {licensed
              ? status.offline
                ? "Acesso offline"
                : "Assinatura ativa"
              : "Acesso não validado"}
          </span>
        </header>
        <section className="intro">
          <div className="intro-copy">
            <p className="eyebrow">TUDO NA MESMA BANCADA</p>
            <h1>
              O próximo projeto
              <br />
              começa por aqui.
            </h1>
            <p>
              Cinco ferramentas, uma assinatura. Instale o que precisa e abra espaço para criar.
            </p>
          </div>
          <div className="account-card">
            <span className="eyebrow">SUA CONTA EDI</span>
            <p role="status">{status?.reason ?? "Validando a sessão protegida…"}</p>
            {status?.userCode && <strong className="code">{status.userCode}</strong>}
            <button
              className="primary"
              type="button"
              disabled={Boolean(busy) || status?.state === "connecting"}
              onClick={() => {
                void run("connect", licensed ? window.ediSuite.refresh : window.ediSuite.connect);
              }}
            >
              {licensed
                ? "Verificar acesso"
                : status?.state === "connecting"
                  ? "Aguardando autorização…"
                  : "Conectar minha conta ↗"}
            </button>
            {licensed && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  void run("logout", window.ediSuite.logout);
                }}
              >
                Sair deste computador
              </button>
            )}
            {status?.expiresAt && (
              <small>
                Validação válida até {new Date(status.expiresAt).toLocaleString("pt-BR")}
              </small>
            )}
          </div>
        </section>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="section-heading">
          <h2>Suas ferramentas</h2>
          <span>Em desenvolvimento · interfaces preservadas</span>
        </div>
        <section className="tool-grid" aria-label="Ferramentas criativas">
          {EDI_TOOLS.map((tool, index) => {
            const installation = tools.find((item) => item.id === tool.id);
            const action = installationAction(installation);
            return (
              <article className={`tool tool-${tool.id}`} key={tool.id}>
                <div className="tool-mark" aria-hidden="true">
                  {["Au", "Ca", "Fo", "Pd", "Sv"][index]}
                </div>
                <h3>{tool.name}</h3>
                <p>{tool.description}</p>
                <small>
                  {installation?.version
                    ? `Instalada · v${installation.version}`
                    : "Disponível para instalação"}
                </small>
                <button
                  type="button"
                  disabled={
                    Boolean(busy) ||
                    (action !== "open" && !installation?.available) ||
                    (action === "open" && !licensed)
                  }
                  onClick={() => {
                    void toolAction(tool.id);
                  }}
                >
                  {busy === tool.id
                    ? "Aguarde…"
                    : action === "open"
                      ? "Abrir ferramenta ↗"
                      : action === "update"
                        ? "Atualizar"
                        : "Instalar"}
                </button>
                {installation?.error && (
                  <p className="tool-error" role="status">
                    {installation.error}
                  </p>
                )}
              </article>
            );
          })}
        </section>
        <footer className="work-note">
          <strong>Seu trabalho é seu.</strong>
          <p>
            Arquivos locais são preservados. As atualizações baixam automaticamente; uma ferramenta
            aberta nunca é encerrada à força.
          </p>
          <span>
            {PRODUCTS.filter((product) => product.app === "edi")
              .map(
                (product) =>
                  `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    (product.listPrice?.amountCents ?? 0) / 100,
                  )}/${product.interval === "month" ? "mês" : "ano"}`,
              )
              .join(" · ")}{" "}
            · consumo pago de IA separado
          </span>
        </footer>
      </main>
    </div>
  );
}
