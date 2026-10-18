import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { modelLabel, usageLabel } from "@shared/aiModels";
import { type AiSettingsView, ENGINE_LABEL } from "@shared/types";
import {
  ArrowUp,
  Check,
  CircleSlash,
  KeyRound,
  ListVideo,
  Loader,
  type LucideIcon,
  RotateCcw,
  Scissors,
  Settings,
  Sparkles,
  Square,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cancelAiCall, runningCall, useAiCalls } from "@/lib/aiActivity";
import { proposeCleanup } from "@/lib/proposals";
import { useApp } from "@/state/app";
import { type ChatItem, type ToolActivity, useAssistant } from "@/state/assistant";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { Button } from "@/ui";
import { PlatformCard } from "./PlatformCard";

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
  const { send, stop, reset, load } = useAssistant();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const items = conv?.items ?? [];
  const busy = conv?.busy ?? false;

  useEffect(() => {
    void window.api.aiSettings().then(setSettings);
  }, []);
  // The conversation kept for this lesson comes back when it opens.
  useEffect(() => {
    if (conversationId !== "none") void load(conversationId);
  }, [conversationId, load]);

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
        <PlatformCard />
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
        <PlatformCard />
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
          <Message key={it.id} item={it} conversationId={conversationId} />
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

const percent = (ratio: number): string => `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * One line of a tool: what it is, how it ended or, while it runs, what it is doing now (the step
 * the editor reports) with how far it got, and the button that cancels it.
 */
function ToolLine({
  tool,
  conversationId,
}: {
  tool: ToolActivity;
  conversationId: string;
}): ReactNode {
  const call = useAiCalls((s) =>
    tool.status === "running" ? runningCall(s.calls, conversationId, tool.name) : undefined,
  );
  const step = call?.step ?? tool.progress?.step;
  const ratio = call?.ratio ?? tool.progress?.ratio;
  const running = tool.status === "running";
  return (
    <div className={`tool-line tool-${tool.status}`} title={tool.summary}>
      <div className="tool-row">
        {running ? (
          <Loader size={11} className="spin" />
        ) : tool.status === "done" ? (
          <Check size={11} />
        ) : (
          <X size={11} />
        )}
        <span className="tool-title">{tool.title}</span>
        {!running && tool.summary && <span className="tool-summary">{tool.summary}</span>}
        {call && (
          <button
            type="button"
            className="tool-cancel"
            title="Cancelar esta ferramenta (o resto do pedido continua)"
            onClick={() => cancelAiCall(call.id)}
          >
            <CircleSlash size={11} /> Cancelar
          </button>
        )}
      </div>
      {running && step && (
        <div className="tool-progress">
          <span className="tool-step">{step}</span>
          {ratio !== undefined && (
            <>
              <span className="tool-bar" aria-hidden="true">
                <span style={{ width: percent(ratio) }} />
              </span>
              <span className="mono">{percent(ratio)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** What a turn changed in the lesson, each with "Ir até", and the button that undoes the turn. */
function TurnChanges({
  item,
  conversationId,
}: {
  item: ChatItem;
  conversationId: string;
}): ReactNode {
  const undoTurn = useAssistant((s) => s.undoTurn);
  // The turn can be taken back while its edits are the last ones of the history.
  const onTop = useProject((s) => {
    const top = s.pastMeta[s.pastMeta.length - 1];
    return !!item.turn && top?.turn === item.turn;
  });
  const [open, setOpen] = useState(true);
  if (!item.changes?.length) return null;
  return (
    <div className="turn-changes">
      <div className="turn-changes-head">
        <button type="button" className="link" onClick={() => setOpen(!open)}>
          <strong>O que mudou</strong> ({item.changes.filter((c) => c.kind !== "more").length})
        </button>
        <span className="spacer" />
        {onTop && (
          <button
            type="button"
            className="link"
            title="Desfaz todas as edições deste pedido de uma vez"
            onClick={() => undoTurn(conversationId, item.id)}
          >
            <Undo2 size={11} /> Desfazer este pedido
          </button>
        )}
      </div>
      {open && (
        <ul>
          {item.changes.map((c) => (
            <li key={c.id}>
              <span>{c.label}</span>
              {c.at !== undefined && (
                <button
                  type="button"
                  className="link"
                  title="Leva o cursor a esse momento da aula"
                  onClick={() => {
                    playback.pause();
                    playback.seek(c.at ?? 0);
                  }}
                >
                  Ir até {clock(c.at)}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Message({ item, conversationId }: { item: ChatItem; conversationId: string }): ReactNode {
  if (item.role === "user") return <div className="msg msg-user">{item.text}</div>;
  if (item.role === "error") return <div className="msg msg-error">{item.text}</div>;
  return (
    <div className="msg msg-assistant">
      {item.tools.length > 0 && (
        <div className="tool-log">
          {item.tools.map((t) => (
            <ToolLine key={t.id} tool={t} conversationId={conversationId} />
          ))}
        </div>
      )}
      {item.text && <Rich text={item.text} />}
      <TurnChanges item={item} conversationId={conversationId} />
      {item.usage && (
        <div className="msg-usage muted small" title="O que este pedido usou">
          {usageLabel(item.usage)}
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
