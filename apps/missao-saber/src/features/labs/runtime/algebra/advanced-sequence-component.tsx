"use client";

import { useId } from "react";
import type { LabToolProps } from "../types";
import {
  advancedSequenceSummary,
  affineTrace,
  blockFigures,
  conditionalTrace,
  figureValue,
  hanoiTowers,
  parseAdvancedSequence,
  sumTerm,
  weekdays,
} from "./advanced-sequences";
import {
  AdvancedFrame,
  advancedButton,
  Choice,
  Range,
  SeriesPlot,
  slots,
  useAdvancedState,
} from "./advanced-ui";
import { formatNumber } from "./math";
import { sequenceGivenSummary } from "./sequence-given-summary";

export function AdvancedSequenceTool(props: LabToolProps) {
  const { state: s, update, error } = useAdvancedState(props, parseAdvancedSequence);
  const figureId = useId();
  return (
    <AdvancedFrame
      summary={
        props.hideResults
          ? sequenceGivenSummary(props.launch, s)
          : advancedSequenceSummary(s, props.launch.grade)
      }
      error={error}
      disabled={props.disabled}
    >
      {s.kind === "stairs" && (
        <>
          <div className="space-y-1 overflow-x-auto rounded-controle border-2 border-sombra bg-creme p-3">
            {slots(s.rows).map((row) => (
              <div key={row} className="flex items-center gap-1">
                <span className="w-7 shrink-0 text-xs">{row}</span>
                {slots(s.first + (row - 1) * s.step).map((cell) => (
                  <span
                    key={cell}
                    className="block h-4 w-4 shrink-0 border border-sombra bg-[var(--ms-verde)]"
                  />
                ))}
                <span className="ml-1 text-xs">{s.first + (row - 1) * s.step} peças</span>
              </div>
            ))}
          </div>
          <Range
            label="Fileiras"
            value={s.rows}
            min={1}
            max={10}
            onChange={(rows) => update({ rows })}
          />
          <Range
            label="Peças da primeira fileira"
            value={s.first}
            min={1}
            max={4}
            onChange={(first) => update({ first })}
          />
          <Range
            label="Peças a mais em cada fileira nova"
            value={s.step}
            min={1}
            max={3}
            onChange={(step) => update({ step })}
          />
        </>
      )}
      {s.kind === "inverse" && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-controle border-2 border-sombra bg-creme p-4 text-lg">
            <span className="rounded border-2 p-3">Entrada ?</span>
            <span>→ {s.multiplyFirst ? `× ${s.multiplier}` : `+ (${s.increment})`} →</span>
            <span>→ {s.multiplyFirst ? `+ (${s.increment})` : `× ${s.multiplier}`} →</span>
            <span className="rounded border-2 p-3">Saída {s.output}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label="Número que saiu"
              value={s.output}
              min={-30}
              max={50}
              onChange={(output) => update({ output })}
            />
            <Range
              label="Multiplicar por"
              value={s.multiplier}
              min={1}
              max={5}
              onChange={(multiplier) => update({ multiplier })}
            />
            <Range
              label="Somar"
              value={s.increment}
              min={-10}
              max={10}
              onChange={(increment) => update({ increment })}
            />
            <Choice
              label="Ordem na ida"
              value={s.multiplyFirst ? "multiply" : "add"}
              options={[
                { value: "multiply", label: "Multiplicar, depois somar" },
                { value: "add", label: "Somar, depois multiplicar" },
              ]}
              onChange={(order) => update({ multiplyFirst: order === "multiply" })}
            />
          </div>
          <p className="text-sm">
            Na volta, leia as caixas da direita para a esquerda e use as operações que desfazem cada
            etapa.
          </p>
        </>
      )}
      {s.kind === "affine" && (
        <>
          {props.hideResults ? (
            <p>
              Entrada inicial {s.start} → multiplicar por {s.multiplier} → somar {s.increment} →
              devolver a saída à entrada. Repita {s.steps} vezes.
            </p>
          ) : (
            <SeriesPlot values={affineTrace(s)} label="Aplicações sucessivas da regra" />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label="Valor inicial a₀"
              value={s.start}
              min={-10}
              max={20}
              onChange={(start) => update({ start })}
            />
            <Range
              label="Multiplicar o anterior por"
              value={s.multiplier}
              min={-2}
              max={3}
              onChange={(multiplier) => update({ multiplier })}
            />
            <Range
              label="Depois, somar"
              value={s.increment}
              min={-6}
              max={8}
              onChange={(increment) => update({ increment })}
            />
            <Range
              label="Número de passos"
              value={s.steps}
              min={0}
              max={10}
              onChange={(steps) => update({ steps })}
            />
          </div>
          <p className="text-sm">
            A posição a₀ vem antes de qualquer passo. A quarta posição contando desde a₀ exige três
            aplicações.
          </p>
        </>
      )}
      {s.kind === "hanoi" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {hanoiTowers(s)
              .map((tower, index) => ({ tower, peg: index + 1 }))
              .map(({ tower, peg }) => (
                <div
                  key={peg}
                  className="flex min-h-44 flex-col justify-end rounded-controle border-2 border-sombra p-2"
                >
                  <p className="mb-auto text-center text-sm font-semibold">Haste {peg}</p>
                  {[...tower].reverse().map((disk) => (
                    <div
                      key={disk}
                      className="mx-auto mb-1 rounded bg-[var(--ms-verde)] p-1 text-center text-xs text-white"
                      style={{ width: `${25 + disk * 11}%` }}
                    >
                      {disk}
                    </div>
                  ))}
                  <div className="border-b-4 border-sombra" />
                </div>
              ))}
          </div>
          <Range
            label="Discos (reinicia a torre)"
            value={s.disks}
            min={1}
            max={6}
            onChange={(disks) => update({ disks, moves: [] })}
          />
          <div className="flex flex-wrap gap-2">
            {slots(3).flatMap((from) =>
              slots(3)
                .filter((to) => to !== from)
                .map((to) => (
                  <button
                    className={advancedButton}
                    key={`${from}-${to}`}
                    type="button"
                    onClick={() => update({ moves: [...s.moves, { from: from - 1, to: to - 1 }] })}
                  >
                    Mover {from} → {to}
                  </button>
                )),
            )}
            <button
              type="button"
              className={advancedButton}
              disabled={!s.moves.length}
              onClick={() => update({ moves: s.moves.slice(0, -1) })}
            >
              Desfazer
            </button>
          </div>
          <p className="text-sm">
            Movimentos: {s.moves.length}.{" "}
            {!props.hideResults && "Recorrência do mínimo: H(n)=2·H(n−1)+1, com H(0)=0."} Uma
            tentativa longa não prova que esse é o mínimo.
          </p>
        </>
      )}
      {s.kind === "block" && (
        <>
          <section className="flex flex-wrap gap-2" aria-label="Primeiras posições do padrão">
            {slots(Math.min(21, s.block.length * 3)).map((position) => (
              <span
                key={position}
                className={`rounded-controle border-2 p-2 text-center text-xs ${position === s.position ? "border-[var(--ms-verde)] bg-creme" : "border-sombra"}`}
              >
                <span className="block">{position}</span>
                {props.hideResults && position === s.position
                  ? "?"
                  : (s.alphabet === "week" ? weekdays : blockFigures)[
                      s.block[(position - 1) % s.block.length] ?? 0
                    ]}
              </span>
            ))}
          </section>
          <Choice
            label="Símbolos do bloco"
            value={s.alphabet}
            options={[
              { value: "figures", label: "Figuras" },
              { value: "week", label: "Dias da semana" },
            ]}
            onChange={(alphabet) =>
              update({ alphabet, block: alphabet === "week" ? [0, 1, 2, 3, 4, 5, 6] : [0, 0, 1] })
            }
          />
          <Range
            label="Comprimento do bloco"
            value={s.block.length}
            min={2}
            max={7}
            onChange={(length) =>
              update({ block: slots(length).map((position) => s.block[position - 1] ?? 0) })
            }
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {slots(s.block.length).map((position) => (
              <Choice
                key={position}
                label={`Lugar ${position} do bloco`}
                value={String(s.block[position - 1])}
                options={(s.alphabet === "week" ? weekdays : blockFigures).map((label, value) => ({
                  label,
                  value: String(value),
                }))}
                onChange={(value) =>
                  update({
                    block: s.block.map((old, index) =>
                      index === position - 1 ? Number(value) : old,
                    ),
                  })
                }
              />
            ))}
          </div>
          <Range
            label="Posição investigada"
            value={s.position}
            min={1}
            max={200}
            onChange={(position) => update({ position })}
          />
        </>
      )}
      {s.kind === "figures" && (
        <>
          {!props.hideResults && (
            <SeriesPlot
              values={slots(10).map((position) => figureValue(s, position))}
              start={1}
              label="Quantidade em cada figura"
            />
          )}
          <svg
            viewBox="0 0 440 180"
            className="max-h-60 w-full bg-creme"
            role="img"
            aria-labelledby={figureId}
          >
            <title
              id={figureId}
            >{`Decomposição em ${s.a} quadrados de ${s.position} por ${s.position}, ${s.b} faixas com ${s.position} peças e ${s.c} peças fixas.`}</title>
            {[
              {
                key: "square",
                x: 10,
                count: s.a * s.position ** 2,
                label: `${s.a} blocos ${s.position}×${s.position}`,
              },
              { key: "strip", x: 155, count: s.b * s.position, label: `${s.b} × ${s.position}` },
              { key: "fixed", x: 300, count: s.c, label: String(s.c) },
            ].map(({ key, x, count, label }) => (
              <g key={key}>
                <text x={x} y="18" fontSize="13">
                  {label}
                </text>
                {slots(Math.abs(count)).map((cell) => (
                  <rect
                    key={cell}
                    x={x + ((cell - 1) % (key === "fixed" ? 10 : s.position)) * 4}
                    y={
                      30 +
                      Math.floor((cell - 1) / (key === "fixed" ? 10 : s.position)) * 4 +
                      (key === "square" ? Math.floor((cell - 1) / s.position ** 2) * 4 : 0)
                    }
                    width="3"
                    height="3"
                    fill={count < 0 ? "#a33131" : "#247a58"}
                  />
                ))}
              </g>
            ))}
          </svg>
          <div className="grid gap-3 sm:grid-cols-2">
            {props.launch.grade > 3 && (
              <Range
                label={props.launch.grade <= 5 ? "Blocos quadrados" : "Quadrados a"}
                value={s.a}
                min={0}
                max={3}
                onChange={(a) => update({ a })}
              />
            )}
            <Range
              label={props.launch.grade <= 5 ? "Faixas" : "Faixas b"}
              value={s.b}
              min={props.launch.grade <= 5 ? 0 : -6}
              max={8}
              onChange={(b) => update({ b })}
            />
            <Range
              label={props.launch.grade <= 5 ? "Peças fixas" : "Peças fixas c"}
              value={s.c}
              min={props.launch.grade <= 5 ? 0 : -6}
              max={12}
              onChange={(c) => update({ c })}
            />
            <Range
              label={props.launch.grade <= 5 ? "Posição da figura" : "Posição n"}
              value={s.position}
              min={1}
              max={10}
              onChange={(position) => update({ position })}
            />
          </div>
          <p className="text-sm">
            {props.launch.grade <= 5
              ? "Compare a figura com a próxima. Conte só as peças novas para descobrir quanto ela cresceu."
              : `Peças vermelhas são retiradas. A diferença entre figuras consecutivas é ${s.a}(2n+1)+(${s.b}); se a=0, essa diferença fica constante.`}
          </p>
        </>
      )}
      {s.kind === "machine" && (
        <>
          {!props.hideResults && (
            <SeriesPlot values={conditionalTrace(s)} label="Estados da máquina" />
          )}
          <Choice
            label="Regra"
            value={s.rule}
            options={[
              { value: "collatz", label: "Par: dividir por 2; ímpar: 3n+1" },
              { value: "digit-sum", label: "Somar os algarismos" },
            ]}
            onChange={(rule) => update({ rule })}
          />
          <Range
            label="Entrada inicial"
            value={s.start}
            min={1}
            max={9999}
            onChange={(start) => update({ start })}
          />
          <Range
            label="Passos"
            value={s.steps}
            min={0}
            max={12}
            onChange={(steps) => update({ steps })}
          />
          {!props.hideResults && (
            <ol className="flex flex-wrap gap-2 text-sm">
              {conditionalTrace(s)
                .map((value, index) => ({ value, step: index }))
                .map(({ value, step }) => (
                  <li key={step} className="rounded border p-2">
                    {step}: {value}{" "}
                    {s.rule === "collatz" && step < s.steps && (
                      <span>({value % 2 ? "ímpar → ×3+1" : "par → ÷2"})</span>
                    )}
                  </li>
                ))}
            </ol>
          )}
        </>
      )}
      {s.kind === "sum" && (
        <>
          {!props.hideResults && (
            <SeriesPlot
              values={slots(s.count).map((position) => sumTerm(s, position))}
              start={1}
              label="Parcelas, não somas acumuladas"
            />
          )}
          <Choice
            label="Regra da parcela k"
            value={s.rule}
            options={[
              { value: "squares", label: "k²: quadrados" },
              { value: "products", label: "k(k+1): retângulos" },
              { value: "odds", label: "2k−1: ímpares" },
              { value: "multiples", label: "a·k: múltiplos" },
              { value: "telescoping", label: "1/[k(k+1)]: diferenças de frações" },
            ]}
            onChange={(rule) => update({ rule })}
          />
          <Range
            label="Última posição n"
            value={s.count}
            min={1}
            max={15}
            onChange={(count) => update({ count })}
          />
          {s.rule === "multiples" && (
            <Range
              label="Fator a"
              value={s.factor}
              min={1}
              max={10}
              onChange={(factor) => update({ factor })}
            />
          )}
          <div className="rounded-controle border-2 border-sombra p-3 text-sm">
            S(n+1) = S(n) + {formatNumber(sumTerm(s, s.count + 1))}
            {s.rule === "telescoping" && (
              <p>1/[k(k+1)] = 1/k − 1/(k+1). Escreva as parcelas para ver quais termos cancelam.</p>
            )}
          </div>
        </>
      )}
    </AdvancedFrame>
  );
}
