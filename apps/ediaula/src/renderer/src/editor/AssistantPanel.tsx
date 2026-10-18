import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { modelLabel, usageLabel } from "@shared/aiModels";
import { type AiSettingsView, ENGINE_LABEL, type PublishInfo } from "@shared/types";
import {
  ArrowUp,
  Check,
  Copy,
  KeyRound,
  ListVideo,
  Loader,
  type LucideIcon,
  RotateCcw,
  Scissors,
  Settings,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { proposeCleanup } from "@/lib/proposals";
import { useApp } from "@/state/app";
import { type ChatItem, useAssistant } from "@/state/assistant";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";

/**
 * Quick starts: a request for the assistant, or (`local`) something the editor does by itself,
 * without the AI and without cost.
 */
type Quick = { icon: LucideIcon; label: string } & (
  | { prompt: string; local?: undefined }
  | { local: () => Promise<{ ok: boolean; message: string }>; prompt?: undefined }
);
const LOCAL_HINT = "Feito no computador, sem a IA e sem custo";
const QUICK: Quick[] = [
  {
    icon: Wand2,
    label: "Limpar a aula",
    // The cleanup is a proposal reviewed item by item in the proposal bar, made on the computer.
    local: () => proposeCleanup(),
  },
  {
    icon: Scissors,
    label: "Achar trechos refeitos",
    prompt:
      "Leia a transcrição e encontre os trechos em que eu errei e repeti a explicação, comecei uma frase e recomecei, ou falei algo fora do assunto. Liste cada um com o horário e o motivo, sem cortar ainda.",
  },
  {
    icon: ListVideo,
    label: "Título, descrição e capítulos",
    prompt:
      "Crie para esta aula: um título curto e atrativo, uma descrição para o YouTube/Hotmart (3 a 5 frases + tópicos) e os capítulos com horários. Salve tudo no projeto.",
  },
  {
    icon: Sparkles,
    label: "Resumo da aula",
    prompt:
      "Faça um resumo da aula com os pontos principais em tópicos e salve como resumo no projeto.",
  },
];

export function AssistantPanel(): ReactNode {
  const project = useProject((s) => s.project);
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const conversationId = project?.id ?? "none";
  const conv = useAssistant((s) => s.conversations[conversationId]);
  const { send, stop, reset } = useAssistant();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const items = conv?.items ?? [];
  const busy = conv?.busy ?? false;

  useEffect(() => {
    void window.api.aiSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const scroll = (): void => list.scrollTo({ top: list.scrollHeight });
    const content = new MutationObserver(scroll);
    const size = new ResizeObserver(scroll);
    content.observe(list, { childList: true, subtree: true, characterData: true });
    size.observe(list);
    scroll();
    return () => {
      content.disconnect();
      size.disconnect();
    };
  }, []);

  if (!project) return null;
  if (settings && settings.engine === "api" && !settings.hasApiKey)
    return (
      <div className="chat">
        {project.publish && <PublishCard info={project.publish} />}
        <NoKey settings={settings} />
      </div>
    );

  const submit = (text: string): void => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    void send(conversationId, t);
  };
  const runQuick = (q: Quick): void => {
    if (q.prompt !== undefined) submit(q.prompt);
    else
      void q
        .local()
        .then((r) => useApp.getState().toast(r.message, r.ok ? "info" : "error"))
        .catch((err: unknown) =>
          useApp
            .getState()
            .toast(
              `Não consegui fazer isso agora: ${err instanceof Error ? err.message : String(err)}`,
              "error",
            ),
        );
  };

  return (
    <div className="assistant">
      <div className="chat" ref={listRef}>
        {project.publish && <PublishCard info={project.publish} />}
        {items.length === 0 && (
          <div className="chat-empty">
            <Sparkles size={22} className="accent" />
            <strong>O que vamos fazer nesta aula?</strong>
            <span className="muted">
              Peça em português. O assistente lê a transcrição e edita a timeline; tudo pode ser
              desfeito com Ctrl+Z.
            </span>
            <div className="quick-list">
              {QUICK.map((q) => (
                <button
                  type="button"
                  key={q.label}
                  className="quick"
                  title={q.local ? LOCAL_HINT : undefined}
                  onClick={() => runQuick(q)}
                >
                  <q.icon size={14} />
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((it) => (
          <Message key={it.id} item={it} />
        ))}
        {busy && items[items.length - 1]?.role === "user" && (
          <div className="msg msg-assistant">
            <span className="thinking">
              <Loader size={13} className="spin" /> Pensando…
            </span>
          </div>
        )}
      </div>

      <div className="composer">
        {items.length > 0 && !busy && (
          <div className="quick-row">
            {QUICK.slice(0, 3).map((q) => (
              <button
                type="button"
                key={q.label}
                className="quick quick-sm"
                title={q.local ? LOCAL_HINT : undefined}
                onClick={() => runQuick(q)}
              >
                <q.icon size={12} />
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div className="composer-box">
          <textarea
            value={draft}
            placeholder='Ex.: "corte a parte em que falo do intervalo"'
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="send stop"
              title="Parar"
              onClick={() => stop(conversationId)}
            >
              <Square size={13} />
            </button>
          ) : (
            <button
              type="button"
              className="send"
              title="Enviar (Enter)"
              disabled={!draft.trim()}
              onClick={() => submit(draft)}
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
        <div className="composer-foot muted">
          <span
            className={`engine-label quota-${conv?.quota?.level ?? "none"}`}
            title={conv?.quota?.text}
          >
            {settings
              ? settings.engine === "api"
                ? `${modelLabel(settings.model).replace(/ \(.*\)$/, "")} · chave da API`
                : ENGINE_LABEL[settings.engine]
              : ""}
            {conv?.quota && conv.quota.level !== "ok" ? ` · ${conv.quota.text}` : ""}
            {conv?.total ? ` · nesta conversa: ${usageLabel(conv.total)}` : ""}
          </span>
          <button
            type="button"
            className="link"
            onClick={() => useApp.getState().set({ settingsOpen: true })}
            title="Trocar o motor da IA"
          >
            <Settings size={11} />
          </button>
          <span className="spacer" />
          {items.length > 0 && (
            <button type="button" className="link" onClick={() => reset(conversationId)}>
              <RotateCcw size={11} /> Nova conversa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Light markdown: paragraphs, bullet lists and **bold**. */
function Rich({ text }: { text: string }): ReactNode {
  const inline = (content: string): ReactNode =>
    withRenderKeys(content.split(/(\*\*[^*]+\*\*)/), (part) => part).map(({ key, value: part }) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={key}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={key}>{part}</span>
      ),
    );
  return (
    <>
      {withRenderKeys(text.trim().split(/\n{2,}/), (block) => block).map(
        ({ key, value: block }) => {
          const lines = withRenderKeys(block.split("\n"), (line) => line);
          if (lines.every(({ value: line }) => /^\s*([-*•]|\d+\.)\s+/.test(line)))
            return (
              <ul key={key}>
                {lines.map(({ key: lineKey, value: line }) => (
                  <li key={lineKey}>{inline(line.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
                ))}
              </ul>
            );
          return (
            <p key={key}>
              {lines.map(({ key: lineKey, value: line }, position) => (
                <span key={lineKey}>
                  {position > 0 && <br />}
                  {inline(line.replace(/^#+\s*/, ""))}
                </span>
              ))}
            </p>
          );
        },
      )}
    </>
  );
}

function Message({ item }: { item: ChatItem }): ReactNode {
  if (item.role === "user") return <div className="msg msg-user">{item.text}</div>;
  if (item.role === "error") return <div className="msg msg-error">{item.text}</div>;
  return (
    <div className="msg msg-assistant">
      {item.tools.length > 0 && (
        <div className="tool-log">
          {item.tools.map((t) => (
            <div key={t.id} className={`tool-line tool-${t.status}`} title={t.summary}>
              {t.status === "running" ? (
                <Loader size={11} className="spin" />
              ) : t.status === "done" ? (
                <Check size={11} />
              ) : (
                <X size={11} />
              )}
              <span className="tool-title">{t.title}</span>
              {t.summary && <span className="tool-summary">{t.summary}</span>}
            </div>
          ))}
        </div>
      )}
      {item.text && <Rich text={item.text} />}
      {item.usage && (
        <div className="msg-usage muted small" title="O que este pedido usou">
          {usageLabel(item.usage)}
        </div>
      )}
    </div>
  );
}

const fmt = (s: number): string => {
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

function CopyButton({ text }: { text: string }): ReactNode {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      title="Copiar"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function PublishCard({ info }: { info: PublishInfo }): ReactNode {
  const [open, setOpen] = useState(true);
  const chapters = info.chapters?.map((c) => `${fmt(c.time)} ${c.title}`).join("\n");
  const description = [info.description, chapters && `Capítulos:\n${chapters}`]
    .filter(Boolean)
    .join("\n\n");
  return (
    <div className="publish">
      <button type="button" className="publish-head" onClick={() => setOpen(!open)}>
        <ListVideo size={14} className="accent" />
        <strong>Publicação</strong>
        <span className="spacer" />
        <span className="muted">{open ? "ocultar" : "mostrar"}</span>
      </button>
      {open && (
        <div className="publish-body">
          {info.title && (
            <div className="publish-field">
              <span className="muted">Título</span>
              <p>{info.title}</p>
              <CopyButton text={info.title} />
            </div>
          )}
          {description && (
            <div className="publish-field">
              <span className="muted">Descrição + capítulos</span>
              <p className="pre">{description}</p>
              <CopyButton text={description} />
            </div>
          )}
          {info.chapters && info.chapters.length > 0 && (
            <div className="chapters">
              {info.chapters.map((c) => (
                <button
                  type="button"
                  key={`${c.time}${c.title}`}
                  className="chapter"
                  onClick={() => playback.seek(c.time)}
                >
                  <span className="mono accent">{fmt(c.time)}</span>
                  {c.title}
                </button>
              ))}
            </div>
          )}
          {info.summary && (
            <div className="publish-field">
              <span className="muted">Resumo</span>
              <p className="pre">{info.summary}</p>
              <CopyButton text={info.summary} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoKey({ settings }: { settings: AiSettingsView }): ReactNode {
  return (
    <div className="setup setup-flush">
      <div className="setup-head">
        <Sparkles size={22} className="accent" />
        <strong>Assistente de IA</strong>
        <p className="muted">Duas formas de usar a IA no EdiAula:</p>
      </div>
      <div className="setup-step">
        <span className="step-num">1</span>
        <div className="setup-body">
          <strong>Com a sua assinatura do Claude ou do ChatGPT</strong>
          <span className="muted">
            Conecte o Claude Code, o Claude Desktop ou o Codex ao EdiAula (igual ao pen). Você
            conversa lá e vê as edições acontecendo aqui.
            {settings.mcpRunning ? " O EdiAula já está pronto para receber a conexão." : ""}
          </span>
        </div>
      </div>
      <div className="setup-step">
        <span className="step-num">2</span>
        <div className="setup-body">
          <strong>Aqui dentro, com uma chave da API da Anthropic</strong>
          <span className="muted">
            Paga por uso, direto na sua conta da Anthropic. Habilita este chat.
          </span>
        </div>
      </div>
      <Button
        variant="primary"
        icon={Settings}
        onClick={() => useApp.getState().set({ settingsOpen: true })}
      >
        Configurar a IA
      </Button>
      <p className="small muted">
        <KeyRound size={11} /> A chave fica criptografada neste computador.
      </p>
    </div>
  );
}
