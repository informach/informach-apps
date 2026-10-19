import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LottieReport } from "../../shared/lottie/model";
import type { Project } from "../../shared/project";
import { runLottieTask } from "./lottieTaskRunner";

interface Settings {
  subdivisions: 1 | 2 | 4;
  confirmSampling: boolean;
  confirmRendererPrecision: boolean;
  confirmAnimationOnly: boolean;
  ready: boolean;
}
interface Props {
  project: Project;
  artboardId: string;
  animationId: string;
  enabled: boolean;
  onChange: (settings: Settings) => void;
  onTask: (controller: AbortController) => void;
}
function LottieExportPanel(props: Props) {
  const [subdivisions, setSubdivisions] = useState<1 | 2 | 4>(1),
    [confirmSampling, setConfirmSampling] = useState(false),
    [confirmRendererPrecision, setConfirmRendererPrecision] = useState(false),
    [confirmAnimationOnly, setConfirmAnimationOnly] = useState(false),
    [report, setReport] = useState<LottieReport | null>(null),
    [error, setError] = useState("");
  const { project, artboardId, animationId, enabled, onChange, onTask } = props;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    onTask(controller);
    setReport(null);
    setError("");
    void runLottieTask(
      project,
      {
        artboardId,
        animationId,
        subdivisions,
        confirmSampling: false,
        confirmRendererPrecision: false,
        confirmAnimationOnly: false,
        alt: "",
      },
      "inspect",
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.kind !== "report") throw new Error("Relatório Lottie inesperado.");
        setReport(result.report);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Falha ao verificar Lottie.");
      });
    return () => controller.abort();
  }, [project, artboardId, animationId, enabled, subdivisions, onTask]);
  useEffect(() => {
    onChange({
      subdivisions,
      confirmSampling,
      confirmRendererPrecision,
      confirmAnimationOnly,
      ready:
        enabled &&
        !!report?.supported &&
        confirmSampling &&
        (!report.requiresRendererPrecisionConsent || confirmRendererPrecision) &&
        (!report.requiresAnimationOnlyConsent || confirmAnimationOnly),
    });
  }, [
    subdivisions,
    confirmSampling,
    confirmRendererPrecision,
    confirmAnimationOnly,
    report,
    enabled,
    onChange,
  ]);
  if (!enabled) return null;
  return (
    <section aria-label="Compatibilidade Lottie">
      <h3>LOTTIE · PERFIL VETORIAL</h3>
      <p>
        Preenchimentos sólidos e gradientes userSpaceOnUse/pad; lineares também aceitam
        objectBoundingBox pela geometria de cada quadro. Paradas usam porcentagens inteiras. O
        perfil relativo requer segmentos cúbicos na fonte; linhas precisam de conversão explícita
        com prévia e consentimento. Contornos requerem caminhos Bézier cúbicos explícitos e escala
        total uniforme; tracejados numéricos locais têm limites de lista e densidade. Gradientes de
        contorno, radiais objectBoundingBox, repeat/reflect, linhas/primitivas com contorno, texto,
        imagens, recortes e componentes ainda são recusados. Consulte o relatório para os limites de
        cada pintura.
      </p>
      <label className="export-field">
        Subdivisões por quadro
        <select
          aria-label="Subdivisões Lottie"
          value={subdivisions}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value !== 1 && value !== 2 && value !== 4) return;
            onChange({
              subdivisions: value,
              confirmSampling: false,
              confirmRendererPrecision: false,
              confirmAnimationOnly: false,
              ready: false,
            });
            setReport(null);
            setSubdivisions(value);
            setConfirmSampling(false);
            setConfirmRendererPrecision(false);
            setConfirmAnimationOnly(false);
          }}
        >
          <option value="1">1 · FPS original</option>
          <option value="2">2 · dobro do FPS</option>
          <option value="4">4 · quatro vezes o FPS</option>
        </select>
      </label>
      <div role="status" aria-live="polite">
        {error ? (
          <p>{error}</p>
        ) : !report ? (
          <p>Verificando compatibilidade…</p>
        ) : (
          <>
            <p>
              {report.supported
                ? "Compatível com o perfil inicial"
                : "Exportação recusada neste perfil"}{" "}
              · {report.frames} quadros · {report.fps} FPS
            </p>
            <ul>
              {report.issues.map((issue) => (
                <li key={`${issue.code}-${issue.objectId}-${issue.message}`}>
                  {issue.severity === "error" ? "Bloqueio" : "Aviso"}
                  {issue.objectId ? ` · ${issue.objectId}` : ""}: {issue.message}
                </li>
              ))}
            </ul>
            {report.omitted > 0 && (
              <p>
                Mais {report.omitted} diagnósticos não exibidos; corrija os itens acima e verifique
                novamente.
              </p>
            )}
          </>
        )}
      </div>
      <label className="check-row">
        <input
          aria-label="Confirmar amostragem Lottie"
          type="checkbox"
          checked={confirmSampling}
          onChange={(event) => setConfirmSampling(event.target.checked)}
        />
        <span>
          Confirmo a conversão amostrada e Bézier
          <small>
            Não há garantia de igualdade contínua entre amostras. O relatório informa a política do
            quadro final.
          </small>
        </span>
      </label>
      {report?.requiresRendererPrecisionConsent && (
        <label className="check-row">
          <input
            aria-label="Confirmar diferenças de precisão Lottie"
            type="checkbox"
            checked={confirmRendererPrecision}
            onChange={(event) => setConfirmRendererPrecision(event.target.checked)}
          />
          <span>
            Aceito possíveis diferenças nas bordas e curvas
            <small>
              O renderer pode usar precisão float32. Pixels podem diferir mesmo nos quadros
              amostrados; confira o resultado no consumidor de destino.
            </small>
          </span>
        </label>
      )}
      {report?.requiresAnimationOnlyConsent && (
        <label className="check-row">
          <input
            aria-label="Confirmar conversão Lottie somente animação"
            type="checkbox"
            checked={confirmAnimationOnly}
            onChange={(event) => setConfirmAnimationOnly(event.target.checked)}
          />
          <span>
            Confirmo exportar somente animação
            <small>
              Lógica, dados, eventos, áudio e semântica não fazem parte do arquivo Lottie.
            </small>
          </span>
        </label>
      )}
    </section>
  );
}

/** Legacy dialog owns this React island and must unmount it before replacing
 * its container. Inspection and compilation share the same worker ownership. */
export function createLottieExportControls(
  project: Project,
  artboardId: string,
  animationId: string,
  onReadyChange: () => void,
) {
  const element = document.createElement("div"),
    root = createRoot(element);
  let enabled = false,
    disposed = false,
    controller: AbortController | undefined,
    settings: Settings = {
      subdivisions: 1,
      confirmSampling: false,
      confirmRendererPrecision: false,
      confirmAnimationOnly: false,
      ready: false,
    };
  const onChange = (next: Settings) => {
      settings = next;
      onReadyChange();
    },
    onTask = (next: AbortController) => {
      controller = next;
    };
  function render() {
    root.render(
      <LottieExportPanel
        project={project}
        artboardId={artboardId}
        animationId={animationId}
        enabled={enabled}
        onChange={onChange}
        onTask={onTask}
      />,
    );
  }
  return {
    element,
    setEnabled(value: boolean) {
      if (disposed || enabled === value) return;
      controller?.abort();
      enabled = value;
      settings = { ...settings, ready: false };
      if (enabled) render();
      else root.render(null);
    },
    read: () => ({ ...settings }),
    suspend() {
      controller?.abort();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller?.abort();
      root.unmount();
    },
  };
}
