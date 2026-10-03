"use client";
import type { LabToolProps } from "../types";
import { button, Check, Frame, panel, positions, Slider, useTool } from "./controls";
import { formatNumber } from "./math";
import { sequenceGivenSummary } from "./sequence-given-summary";
import {
  cycleNames,
  parseSequence,
  sequenceFormula,
  sequenceSummary,
  sequenceTerm,
} from "./sequences";
export function SequenceTool(props: LabToolProps) {
  const { state: s, update, error } = useTool(props, parseSequence);
  const mode = props.launch.mode;
  const terms = Array.from({ length: s.visible }, (_, index) => sequenceTerm(s, index + 1));
  const highest = Math.max(1, ...terms.map(Math.abs));
  return (
    <Frame
      disabled={props.disabled}
      error={error}
      summary={
        props.hideResults ? sequenceGivenSummary(props.launch, s) : sequenceSummary(props.launch, s)
      }
    >
      <div className={panel}>
        <p className="mb-4 text-sm font-semibold">{sequenceFormula(s, props.launch.grade)}</p>
        {s.rule === "machine" && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={button}>Entrada n</span>
            <span aria-hidden="true">→</span>
            <span className={button}>{s.multiplyFirst ? `× ${s.ratio}` : `+ ${s.step}`}</span>
            <span aria-hidden="true">→</span>
            <span className={button}>{s.multiplyFirst ? `+ ${s.step}` : `× ${s.ratio}`}</span>
            <span aria-hidden="true">→</span>
            <span className={button}>Saída</span>
          </div>
        )}
        <section className="flex flex-wrap items-end gap-3" aria-label="Sequência por posição">
          {terms
            .map((value, index) => ({ value, position: index + 1 }))
            .map(({ value, position }) => (
              <div key={position} className="flex min-w-12 flex-col items-center gap-1">
                <span className="text-xs text-tinta-suave">{position}ª</span>
                {s.rule === "cycle" ? (
                  <span
                    role="img"
                    className="text-3xl"
                    aria-label={
                      props.hideResults && position === s.position
                        ? "Figura a descobrir"
                        : cycleNames[value]
                    }
                  >
                    {props.hideResults && position === s.position
                      ? "?"
                      : ["●", "■", "▲", "★", "◆"][value]}
                  </span>
                ) : s.rule === "squares" && position <= 5 ? (
                  <div className="flex flex-col items-center">
                    <div
                      style={{ gridTemplateColumns: `repeat(${position}, 8px)` }}
                      className="grid gap-0.5"
                    >
                      {positions(position ** 2).map((cell) => (
                        <span key={cell} className="h-2 w-2 bg-sky-800" />
                      ))}
                    </div>
                    <span className="mt-1 text-xs">+ {s.start} fixas</span>
                  </div>
                ) : (
                  <div
                    style={{ height: Math.max(4, (Math.abs(value) / highest) * 110) }}
                    className={`w-8 border-2 border-sombra ${value < 0 ? "bg-orange-200" : "bg-sky-200"}`}
                    aria-hidden="true"
                  />
                )}
                <strong className="text-sm">
                  {(mode === "lacunas" || props.hideResults) && position === s.position
                    ? "?"
                    : s.rule === "cycle"
                      ? cycleNames[value]
                      : formatNumber(value)}
                </strong>
                {s.rule === "competing" && !props.hideResults && (
                  <span className="text-xs">
                    B: {formatNumber(sequenceTerm(s, position, true))}
                  </span>
                )}
              </div>
            ))}
        </section>
        {s.rule === "recurrence" && (
          <p className="mt-4 text-sm">
            Cada nova coluna junta as duas anteriores. Sementes: {s.start} e {s.second}.
          </p>
        )}
        {s.rule === "competing" && (
          <p className="mt-4 text-sm">
            Os três primeiros valores coincidem. As regras foram declaradas: os exemplos sozinhos
            não obrigam a escolher nenhuma delas.
          </p>
        )}
        {s.rule === "linear" && (
          <p className="mt-4 text-sm">
            Diferenças entre vizinhos:{" "}
            {terms
              .slice(1)
              .map((value, i) => formatNumber(value - (terms[i] ?? 0)))
              .join(", ")}
            .
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Posição investigada"
          value={s.position}
          min={1}
          max={30}
          onChange={(position) => update({ position })}
        />
        <Slider
          label="Posições que você quer observar"
          value={s.visible}
          min={3}
          max={12}
          onChange={(visible) => update({ visible })}
        />
        {s.rule === "cycle" ? (
          <Slider
            label="Figuras no bloco repetido"
            value={s.period}
            min={2}
            max={5}
            onChange={(period) => update({ period })}
          />
        ) : (
          <>
            {s.rule !== "machine" && (
              <Slider
                label={s.rule === "squares" ? "Peças fixas fora do quadrado" : "Valor inicial"}
                value={s.start}
                min={
                  props.launch.grade <= 5 || ["squares", "recurrence"].includes(s.rule) ? 0 : -10
                }
                max={20}
                onChange={(start) => update({ start })}
              />
            )}
            {["linear", "competing", "machine"].includes(s.rule) && (
              <Slider
                label="Passo de adição"
                value={s.step}
                min={-6}
                max={8}
                onChange={(step) => update({ step })}
              />
            )}
            {["geometric", "machine"].includes(s.rule) && (
              <Slider
                label="Fator de multiplicação"
                value={s.ratio}
                min={0.5}
                max={3}
                step={0.5}
                onChange={(ratio) => update({ ratio })}
              />
            )}
            {s.rule === "recurrence" && (
              <Slider
                label="Segunda semente"
                value={s.second}
                min={0}
                max={10}
                onChange={(second) => update({ second })}
              />
            )}
            {s.rule === "machine" && (
              <Check
                checked={s.multiplyFirst}
                onChange={(multiplyFirst) => update({ multiplyFirst })}
              >
                Multiplicar antes de somar
              </Check>
            )}
            {mode === "pg-termo-soma" && (
              <Check checked={s.showSum} onChange={(showSum) => update({ showSum })}>
                Investigar a soma até a posição (desmarcado: somente o termo)
              </Check>
            )}
          </>
        )}
      </div>
    </Frame>
  );
}
