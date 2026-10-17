import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { ENGINE_LABEL } from "@shared/types";
import {
  ArrowUp,
  Blend,
  Check,
  KeyRound,
  Loader,
  type LucideIcon,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  SunMedium,
  WandSparkles,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ChatItem, useAssistant } from "@/state/assistant";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

const QUICK: { icon: LucideIcon; label: string; prompt: string }[] = [
  {
    icon: WandSparkles,
    label: "Melhorar a foto",
    prompt:
      "Olhe a foto e melhore luz, contraste e cor de forma natural, com camadas de ajuste. Depois me diga em uma frase o que mudou.",
  },
  {
    icon: Blend,
    label: "Sugerir modo de mesclagem",
    prompt:
      "Compare os modos de mesclagem da camada ativa e aplique o que fica melhor. Me diga as duas melhores opções e por quê.",
  },
  {
    icon: SunMedium,
    label: "Céu mais dramático",
    prompt:
      "Deixe o céu mais dramático (mais contraste e cor) sem mexer no resto da foto, usando uma camada de ajuste com máscara em degradê.",
  },
  {
    icon: Sparkles,
    label: "Tom de cinema",
    prompt:
      "Aplique um tom de cinema sutil (sombras levemente frias, luzes quentes) usando camadas e modos de mesclagem que eu possa ajustar depois.",
  },
];

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
  const ds = useDoc(),
    busy = useAssistant((s) => s.busy);
  const sameDoc = ds.doc?.id === item.documentId;
  const canUndo = !!item.historyId && sameDoc && ds.past.at(-1)?.id === item.historyId && !busy;
  const canCompare =
    sameDoc && !!item.layerId && !!ds.doc?.layers.some((l) => l.id === item.layerId) && !busy;
  if (item.role === "user") return <div className="msg msg-user">{item.text}</div>;
  if (item.role === "error") return <div className="msg msg-error">{item.text}</div>;
  return (
    <div className="msg">
      {item.tools.length > 0 && (
        <div className="tool-log">
          {item.tools.map((t) => (
            <div key={t.id} className={`tool-line tool-${t.status}`} title={t.summary}>
              {t.status === "running" ? (
                <Loader size={12} className="spin" />
              ) : t.status === "done" ? (
                <Check size={12} />
              ) : (
                <X size={12} />
              )}
              <span className="tool-title">{t.title}</span>
              {t.summary && <span className="tool-summary">{t.summary}</span>}
            </div>
          ))}
        </div>
      )}
      {item.text && <Rich text={item.text} />}
      {item.historyId && (
        <div className="quick-row">
          <button
            type="button"
            className="btn"
            disabled={!canCompare}
            onClick={() => {
              useDoc.getState().setActive(item.layerId!);
              useUi.setState({ compareOpen: true });
            }}
          >
            Comparar lado a lado
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canUndo}
            title={
              canUndo
                ? "Desfazer as alterações deste turno"
                : "Disponível enquanto este turno for a última alteração do documento"
            }
            onClick={() => {
              const s = useDoc.getState();
              if (s.doc?.id === item.documentId && s.past.at(-1)?.id === item.historyId) s.undo();
            }}
          >
            Desfazer tudo
          </button>
        </div>
      )}
    </div>
  );
}

export function AssistantPanel(): ReactNode {
  const { items, busy, quota, send, stop, reset } = useAssistant();
  const ai = useUi((s) => s.ai);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useUi.getState().refreshAi();
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

  const submit = (text: string): void => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    void send(t);
  };
  const needsKey = ai?.engine === "api" && !ai.hasApiKey;
  const engineReady = ai && (ai.engine === "api" ? ai.hasApiKey : ai.mcpRunning);

  return (
    <div className="agent">
      <div className="agent-head">
        <Sparkles size={15} className="lead" />
        Assistente
        <span className="spacer" />
        {items.length > 0 && (
          <button type="button" className="icon-btn" title="Nova conversa" onClick={reset}>
            <RotateCcw size={14} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          title="Fechar"
          onClick={() => useUi.setState({ assistantOpen: false })}
        >
          <X size={15} />
        </button>
      </div>

      <div className="chat" ref={listRef}>
        {needsKey ? (
          <div className="chat-empty">
            <KeyRound size={22} className="accent" />
            <strong>Falta configurar a IA</strong>
            <span className="muted">
              Escolha usar o Claude Code ou o Codex com a sua assinatura, ou cadastre uma chave da
              API da Anthropic.
            </span>
            <button
              type="button"
              className="btn btn-primary"
              style={{ alignSelf: "flex-start" }}
              onClick={() => useUi.setState({ settingsOpen: true })}
            >
              <Settings size={14} /> Configurar
            </button>
          </div>
        ) : (
          items.length === 0 && (
            <div className="chat-empty">
              <Sparkles size={22} className="accent" />
              <strong>O que vamos fazer nesta foto?</strong>
              <span className="muted">
                Peça em português. O assistente olha a imagem, cria camadas, escolhe modos de
                mesclagem e ajusta luz e cor. Tudo vira um passo no Histórico (Ctrl+Z desfaz).
              </span>
              <div className="quick-list">
                {QUICK.map((q) => (
                  <button
                    type="button"
                    key={q.label}
                    className="quick"
                    onClick={() => submit(q.prompt)}
                  >
                    <q.icon size={14} />
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        {items.map((it) => (
          <Message key={it.id} item={it} />
        ))}
        {busy && items[items.length - 1]?.role === "user" && (
          <span className="thinking">
            <Loader size={13} className="spin" /> Pensando…
          </span>
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
                onClick={() => submit(q.prompt)}
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
            rows={2}
            placeholder='Ex.: "deixa a pele mais suave sem perder textura"'
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
          />
          {busy ? (
            <button type="button" className="send stop" title="Parar" onClick={stop}>
              <Square size={12} fill="currentColor" />
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
        <div className="composer-foot">
          <span className={`dot${engineReady ? "" : " is-off"}`} />
          <span
            className={quota && quota.level !== "ok" ? `quota-${quota.level}` : undefined}
            title={quota?.text}
          >
            {ai
              ? ai.engine === "api"
                ? `${ai.model} · chave da API`
                : ENGINE_LABEL[ai.engine]
              : ""}
            {quota && quota.level !== "ok" ? ` · ${quota.text}` : ""}
          </span>
          <button
            type="button"
            title="Trocar o motor da IA"
            onClick={() => useUi.setState({ settingsOpen: true })}
          >
            <Settings size={11} />
          </button>
          <span className="spacer" />
          {items.length > 0 && (
            <button type="button" onClick={reset}>
              <RotateCcw size={11} /> Nova conversa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
