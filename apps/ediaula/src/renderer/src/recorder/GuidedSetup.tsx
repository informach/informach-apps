import {
  GUIDED_DEFAULTS,
  GUIDED_KEYS,
  type GuidedPlan,
  type GuidedStep,
  scheduleGuided,
  stepsFromScript,
  stepsFromWords,
} from "@shared/guidedRecording";
import type { Transcript } from "@shared/types";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { PreviewMedia } from "@/ui/PreviewMedia";
import "./guided.css";

export function GuidedSetup({
  plan,
  change,
  script,
  busy,
  onBusy,
  keys,
}: {
  plan: GuidedPlan;
  change: (p: GuidedPlan) => void;
  script: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  /** The recorder's shortcuts as configured: target, start and pause, stop. */
  keys: { target: string; toggle: string; stop: string };
}) {
  const [text, setText] = useState(script);
  const [picking, setPicking] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const audioCues = useMemo(
    () =>
      plan.steps.map((step, index) => ({
        start: step.speechAt ?? step.at,
        end:
          plan.steps[index + 1]?.speechAt ?? plan.steps[index + 1]?.at ?? plan.audio?.duration ?? 0,
        text: step.speech,
      })),
    [plan.steps, plan.audio?.duration],
  );
  useEffect(() => {
    setText((value) => value || script);
  }, [script]);
  const notifyBusy = useEffectEvent(onBusy);
  useEffect(() => {
    notifyBusy(loading || !!picking);
    return () => notifyBusy(false);
  }, [loading, picking]);
  const update = (id: string, patch: Partial<GuidedStep>) =>
    change({ ...plan, steps: plan.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const updatePickedTarget = useEffectEvent(update);
  useEffect(() => {
    if (!picking) return;
    void window.api.recorder.interactive(false);
    return window.api.recorder.onHotkey((name) => {
      if (name !== "guided-target") return;
      void window.api.recorder
        .guidedPick()
        .then((target) => updatePickedTarget(picking, { target }))
        .catch((e) => setError((e as Error).message))
        .finally(() => setPicking(null));
    });
  }, [picking]);

  async function audio() {
    setLoading(true);
    setError("");
    try {
      const path = await window.api.recorder.pickNarration();
      if (!path) return;
      const info = await window.api.probe(path);
      if (!info.hasAudio) throw new Error("Selecione um arquivo com narração.");
      change({ ...plan, audio: { path, duration: info.duration } });
      const transcript = await window.api.transcribe(
        `guided-${Date.now()}`,
        path,
        info.duration,
        "pt",
        [],
      );
      const response = await fetch(mediaUrl(transcript));
      if (!response.ok) throw new Error("Não foi possível ler a transcrição.");
      const data: Transcript = await response.json();
      const steps = stepsFromWords(data.words);
      change({ ...plan, audio: { path, duration: info.duration }, steps });
      if (!steps.length)
        setError(
          "Áudio carregado. Não encontrei comandos “clique”; adicione etapas e seus tempos manualmente.",
        );
    } catch (e) {
      setError(
        `${(e as Error).message} Você também pode definir os tempos das etapas manualmente.`,
      );
    } finally {
      setLoading(false);
    }
  }
  let validation = "";
  try {
    scheduleGuided(plan);
  } catch (e) {
    validation = (e as Error).message;
  }
  return (
    <section className={`guided-setup ${picking ? "is-picking" : ""}`}>
      {picking ? (
        <div className="guided-pick">
          Posicione o mouse no alvo e pressione <b>{keys.target}</b>. Não precisa clicar.{" "}
          <button
            type="button"
            onMouseEnter={() => void window.api.recorder.interactive(true)}
            onClick={() => {
              setPicking(null);
              void window.api.recorder.interactive(true);
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <>
          <h3>Gravação guiada · ritmo didático · 9 a 14 anos</h3>
          <p>
            Mover suavemente → chegar antes da fala → esperar no alvo → clicar → observar o
            resultado. Esse ritmo é aplicado a cada etapa ao gravar.
          </p>
          <p>
            Revise cada ação e marque seus alvos. Mantenha a janela no mesmo lugar. {keys.toggle}{" "}
            pausa; {keys.stop} interrompe e salva.
          </p>
          <fieldset disabled={busy || loading}>
            <div className="guided-actions">
              <input
                aria-label="Endereço da aula"
                type="url"
                placeholder="https://sua-plataforma/aula"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  setError("");
                  void window.api.recorder
                    .guidedBrowser(url)
                    .catch((e) => setError((e as Error).message));
                }}
              >
                Abrir ambiente de aula
              </button>
            </div>
            <p>
              Abra a aula, entre na plataforma e pressione {keys.target} para voltar. Nessa janela,
              os alvos são identificados pelos elementos da página. O login é feito diretamente por
              você.
            </p>
            <textarea
              aria-label="Roteiro da demonstração"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole o roteiro, uma etapa por linha"
              rows={3}
            />
            <div className="guided-actions">
              <button
                type="button"
                onClick={() => change({ ...plan, steps: stepsFromScript(text), audio: undefined })}
              >
                Criar etapas do roteiro
              </button>
              <button type="button" onClick={() => void audio()}>
                Importar áudio ou MP4 do HeyGen
              </button>
            </div>
            <p>
              Selecione o MP4 exportado pelo HeyGen. A voz é extraída automaticamente e usada para
              ouvir, transcrever e sincronizar as ações. O arquivo original é preservado.
            </p>
            <p>
              Roteiro: tempos estimados para narrar depois. Áudio: tempos de “clique” sugeridos pela
              transcrição; revise-os antes de gravar.
            </p>
            {plan.audio && (
              <div>
                Áudio: {plan.audio.path.split(/[\\/]/).pop()}{" "}
                <button type="button" onClick={() => change({ ...plan, audio: undefined })}>
                  Remover áudio
                </button>
                <PreviewMedia
                  kind="audio"
                  controls
                  src={mediaUrl(plan.audio.path)}
                  cues={audioCues}
                  label="Prévia da narração guiada"
                />
                <p>
                  Use fones. A narração será adicionada em faixa separada; microfone e áudio do PC
                  ficam desligados neste modo para evitar duplicação.
                </p>
              </div>
            )}
            <div className="guided-timing">
              {(
                [
                  ["move", "Movimento", 0.5, 5],
                  ["anticipation", "Antes da fala", 0.3, 5],
                  ["dwell", "Antes do clique", 0.3, 5],
                  ["after", "Após a ação", 0.5, 15],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label} (s)
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step="0.1"
                    value={plan[key] ?? GUIDED_DEFAULTS[key]}
                    onChange={(e) => change({ ...plan, [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <p>
              Informe o início da frase e o instante da ação no áudio. O cursor chega antes dos
              dois. Os tempos são ajustáveis; etapas sem espaço para movimento e pausas precisam ser
              espaçadas.
            </p>
            <div className="guided-steps">
              {plan.steps.map((s, i) => (
                <div className="guided-step" key={s.id}>
                  <span>{i + 1}.</span>
                  <input
                    aria-label={`Fala da etapa ${i + 1}`}
                    value={s.speech}
                    placeholder="Fala ou descrição"
                    onChange={(e) => update(s.id, { speech: e.target.value })}
                  />
                  <label>
                    Ação em (s)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={s.at}
                      onChange={(e) => update(s.id, { at: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Fala começa em (s)
                    <input
                      type="number"
                      min="0"
                      max={s.at}
                      step="0.1"
                      value={s.speechAt ?? s.at}
                      onChange={(e) =>
                        update(s.id, {
                          speechAt: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <select
                    aria-label={`Ação da etapa ${i + 1}`}
                    value={s.action}
                    onChange={(e) =>
                      update(s.id, { action: e.target.value as GuidedStep["action"], value: "" })
                    }
                  >
                    <option value="point">Apontar</option>
                    <option value="click">Clicar</option>
                    <option value="rightClick">Clique direito</option>
                    <option value="type">Clicar e digitar</option>
                    <option value="key">Tecla</option>
                  </select>
                  {s.action === "type" && (
                    <input
                      aria-label="Texto a digitar"
                      placeholder="Texto a digitar"
                      maxLength={1000}
                      value={s.value ?? ""}
                      onChange={(e) => update(s.id, { value: e.target.value })}
                    />
                  )}
                  {s.action === "key" && (
                    <select
                      aria-label="Tecla"
                      value={s.value ?? ""}
                      onChange={(e) => update(s.id, { value: e.target.value })}
                    >
                      <option value="">Tecla…</option>
                      {GUIDED_KEYS.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    title={s.target?.browser?.selector ?? s.target?.title}
                    onClick={() => setPicking(s.id)}
                  >
                    {s.target?.browser
                      ? s.target.browser.kind === "element"
                        ? `Elemento: ${s.target.browser.label || "marcado"}`
                        : "Jogo/quadro: ponto relativo"
                      : s.target
                        ? `Posição: ${s.target.x}, ${s.target.y}`
                        : `Marcar alvo (${keys.target})`}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover etapa ${i + 1}`}
                    onClick={() =>
                      change({ ...plan, steps: plan.steps.filter((x) => x.id !== s.id) })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                change({
                  ...plan,
                  steps: [
                    ...plan.steps,
                    {
                      id: crypto.randomUUID(),
                      speech: "",
                      at: (plan.steps.at(-1)?.at ?? -5) + 5,
                      action: "click",
                    },
                  ],
                })
              }
            >
              Adicionar etapa
            </button>
          </fieldset>
          {loading && <p role="status">Preparando o áudio e transcrevendo a narração…</p>}
          {error && <p role="alert">{error}</p>}
          <p className="guided-validation">
            {validation ||
              "Pronto. O cursor chega antes da fala, aguarda e executa a ação no tempo indicado."}
          </p>
          <small>
            Na janela de aula, botões são localizados novamente antes da ação. Jogos em canvas e
            quadros incorporados usam pontos relativos; em outros navegadores, posições fixas.
            Revise mudanças de conteúdo. O resultado de cada ação ainda não é reconhecido
            automaticamente.
          </small>
        </>
      )}
    </section>
  );
}
