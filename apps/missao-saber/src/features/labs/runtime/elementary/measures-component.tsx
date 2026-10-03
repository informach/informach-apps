"use client";
import type { LabToolProps } from "../types";
import {
  calendarArrival,
  clockText,
  measureDefinition,
  measureSummary,
  parseMeasure,
} from "./measures";
import { DurationTimeline } from "./timeline";
import { NumberControl, Options, Output, panelClass, positions } from "./ui";

function Clock({ minutes, label }: { minutes: number; label: string }) {
  const hourAngle = ((minutes % 720) / 720) * Math.PI * 2 - Math.PI / 2;
  const minuteAngle = ((minutes % 60) / 60) * Math.PI * 2 - Math.PI / 2;
  return (
    <div className="text-center">
      <svg
        viewBox="0 0 140 140"
        role="img"
        aria-label={`${label}: ${clockText(minutes)}`}
        className="mx-auto w-full max-w-44"
      >
        <circle cx="70" cy="70" r="62" fill="white" stroke="#172e2a" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
          <text
            key={hour}
            x={70 + Math.cos((hour / 12) * Math.PI * 2 - Math.PI / 2) * 49}
            y={75 + Math.sin((hour / 12) * Math.PI * 2 - Math.PI / 2) * 49}
            textAnchor="middle"
            fontSize="14"
          >
            {hour}
          </text>
        ))}
        <line
          x1="70"
          y1="70"
          x2={70 + Math.cos(hourAngle) * 29}
          y2={70 + Math.sin(hourAngle) * 29}
          stroke="#172e2a"
          strokeWidth="5"
        />
        <line
          x1="70"
          y1="70"
          x2={70 + Math.cos(minuteAngle) * 43}
          y2={70 + Math.sin(minuteAngle) * 43}
          stroke="#176344"
          strokeWidth="3"
        />
        <circle cx="70" cy="70" r="4" fill="#172e2a" />
      </svg>
      <p className="font-semibold">
        {label}: {clockText(minutes)}
      </p>
    </div>
  );
}
export function MeasuresTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseMeasure(launch, raw);
  const kind = measureDefinition(launch).kind;
  const update = (changes: Partial<typeof state>) =>
    onChange(parseMeasure(launch, { ...state, ...changes }));
  return (
    <div className="space-y-4">
      {kind === "clock" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Clock minutes={state.startMinute} label="Começo" />
            <Clock minutes={state.endMinute} label="Fim" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block font-semibold">
              Horário inicial
              <input
                type="time"
                value={clockText(state.startMinute)}
                className="mt-2 block min-h-11 w-full rounded-controle border-2 border-sombra bg-papel p-2"
                onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(":").map(Number);
                  if (
                    hours === undefined ||
                    minutes === undefined ||
                    !Number.isFinite(hours + minutes)
                  )
                    return;
                  const startMinute = hours * 60 + minutes;
                  update({ startMinute, nextDay: startMinute > state.endMinute || state.nextDay });
                }}
              />
            </label>
            <label className="block font-semibold">
              Horário final
              <input
                type="time"
                value={clockText(state.endMinute)}
                className="mt-2 block min-h-11 w-full rounded-controle border-2 border-sombra bg-papel p-2"
                onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(":").map(Number);
                  if (
                    hours === undefined ||
                    minutes === undefined ||
                    !Number.isFinite(hours + minutes)
                  )
                    return;
                  const endMinute = hours * 60 + minutes;
                  update({ endMinute, nextDay: endMinute < state.startMinute || state.nextDay });
                }}
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={state.nextDay}
              disabled={state.endMinute < state.startMinute}
              onChange={(event) => update({ nextDay: event.target.checked })}
            />
            O término é no dia seguinte
            {state.endMinute < state.startMinute ? " (necessário para estes horários)" : ""}
          </label>
          <DurationTimeline state={state} hideResults={hideResults} />
        </>
      ) : kind === "calendar" ? (
        <>
          <NumberControl
            label="Dia de partida em outubro"
            value={state.day}
            min={1}
            max={31}
            onChange={(day) => update({ day })}
          />
          <NumberControl
            label="Dias depois da partida"
            value={state.daysLater}
            min={1}
            max={30}
            onChange={(daysLater) => update({ daysLater })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { month: "outubro", days: 31, offset: 3 },
              { month: "novembro", days: 30, offset: 6 },
            ].map(({ month, days, offset }) => (
              <div className={panelClass} key={month}>
                <p className="mb-2 font-semibold">{month} de 2026</p>
                <div className="grid grid-cols-7 gap-1 text-center text-sm">
                  {["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"].map(
                    (day) => (
                      <span key={day} aria-hidden="true">
                        {day.charAt(0).toUpperCase()}
                      </span>
                    ),
                  )}
                  {positions(offset).map((index) => (
                    <span key={`blank-${index}`} />
                  ))}
                  {Array.from({ length: days }, (_, index) => index + 1).map((day) => {
                    const start = month === "outubro" && day === state.day;
                    const arrival = calendarArrival(state);
                    const end = !hideResults && month === arrival.month && day === arrival.day;
                    return (
                      <span
                        key={day}
                        className={`rounded border p-1 ${start || end ? "border-tinta bg-emerald-100 font-bold text-emerald-950" : "border-transparent"}`}
                      >
                        <span className="sr-only">{`${day} de ${month}${start ? ", partida" : ""}${end ? ", chegada" : ""}`}</span>
                        <span aria-hidden="true">
                          {day}
                          {start ? "•" : end ? "★" : ""}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm">
            {hideResults
              ? "• Partida. Avance uma casa por dia depois da partida."
              : "• Partida; ★ chegada. Avance uma casa por dia depois da partida."}
          </p>
        </>
      ) : kind === "ruler" ? (
        <>
          {launch.mode === "unidades-e-regua" && (
            <NumberControl
              label="Comprimento da unidade escolhida em cm"
              value={state.rulerUnit}
              min={1}
              max={5}
              onChange={(rulerUnit) => update({ rulerUnit })}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberControl
              label="Ponta inicial em cm"
              value={state.rulerStart}
              min={0}
              max={Math.min(15, state.rulerEnd - 1)}
              onChange={(rulerStart) => update({ rulerStart })}
            />
            <NumberControl
              label="Ponta final em cm"
              value={state.rulerEnd}
              min={state.rulerStart + 1}
              max={30}
              onChange={(rulerEnd) => update({ rulerEnd })}
            />
          </div>
          <svg
            viewBox="0 0 640 130"
            role="img"
            aria-label={
              hideResults
                ? `Fita entre ${state.rulerStart} e ${state.rulerEnd} cm.${launch.mode === "unidades-e-regua" ? ` Cada peça de medida tem ${state.rulerUnit} cm.` : ""}`
                : measureSummary(launch, state)
            }
            className="w-full"
          >
            <rect x="20" y="70" width="600" height="40" fill="#ffedb9" stroke="#172e2a" />
            {positions(31).map((index) => (
              <g key={index}>
                <line
                  x1={20 + index * 20}
                  y1="70"
                  x2={20 + index * 20}
                  y2={index % 5 === 0 ? 90 : 82}
                  stroke="#172e2a"
                />
                <text x={20 + index * 20} y="104" fontSize="11" textAnchor="middle">
                  {index}
                </text>
              </g>
            ))}
            <line
              x1={20 + state.rulerStart * 20}
              y1="45"
              x2={20 + state.rulerEnd * 20}
              y2="45"
              stroke="#176344"
              strokeWidth="14"
            />
            <text x={20 + state.rulerStart * 20} y="23" textAnchor="middle" fontSize="13">
              início
            </text>
            <text x={20 + state.rulerEnd * 20} y="23" textAnchor="middle" fontSize="13">
              fim
            </text>
          </svg>
          {launch.mode === "unidades-e-regua" && (
            <div className="rounded-controle border-2 border-sombra p-3">
              <p className="text-sm">
                Peças de medida alinhadas à fita. A última pode representar apenas parte de uma
                peça.
              </p>
              <svg
                viewBox="0 0 640 80"
                className="w-full"
                role="img"
                aria-label={`Peças consecutivas de ${state.rulerUnit} cm entre as pontas ${state.rulerStart} e ${state.rulerEnd} cm. A parte hachurada indica uma peça incompleta.`}
              >
                {positions(Math.ceil((state.rulerEnd - state.rulerStart) / state.rulerUnit)).map(
                  (index) => {
                    const length = Math.min(
                      state.rulerUnit,
                      state.rulerEnd - state.rulerStart - index * state.rulerUnit,
                    );
                    return (
                      <g key={index}>
                        <rect
                          x={20 + (state.rulerStart + index * state.rulerUnit) * 20}
                          y={12}
                          width={length * 20}
                          height={40}
                          fill={length < state.rulerUnit ? "#ffdab1" : "#c8e6d4"}
                          stroke="#172e2a"
                          strokeDasharray={length < state.rulerUnit ? "4 2" : undefined}
                        />
                        <text
                          x={20 + (state.rulerStart + index * state.rulerUnit + length / 2) * 20}
                          y={38}
                          textAnchor="middle"
                          fontSize={12}
                        >
                          {length < state.rulerUnit ? "parte" : "■"}
                        </text>
                      </g>
                    );
                  },
                )}
              </svg>
            </div>
          )}
        </>
      ) : kind === "choose" ? (
        <div className={panelClass}>
          <p className="text-lg font-semibold">
            {launch.variant ? "▱ Capacidade de uma jarra" : "↔ Comprimento de uma sala"}
          </p>
          <p className="mt-3">
            {launch.variant
              ? "A medida que procuramos diz quanto líquido cabe dentro da jarra."
              : "A medida que procuramos diz a distância entre dois lados da sala."}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <span>
              m<br />
              {!hideResults && "comprimento"}
            </span>
            <span>
              kg
              <br />
              {!hideResults && "massa"}
            </span>
            <span>
              L<br />
              {!hideResults && "capacidade"}
            </span>
          </div>
        </div>
      ) : (
        <>
          <NumberControl
            label={
              kind === "capacity"
                ? "Capacidade de cada copo em mL"
                : kind === "mass"
                  ? "Massa em g"
                  : "Comprimento em cm"
            }
            value={state.amount}
            min={1}
            max={5000}
            onChange={(amount) => update({ amount })}
          />
          {kind === "capacity" ? (
            <>
              <NumberControl
                label="Copos cheios"
                value={state.vessel}
                min={1}
                max={10}
                onChange={(vessel) => update({ vessel })}
              />
              <div
                className="flex flex-wrap gap-3"
                role="img"
                aria-label={`${state.vessel} copos de ${state.amount} mililitros`}
              >
                {positions(state.vessel).map((index) => (
                  <div
                    className="flex h-20 w-16 items-end justify-center rounded-b-xl border-x-2 border-b-2 border-tinta bg-sky-100 p-2 text-xs text-sky-950"
                    key={index}
                  >
                    {state.amount}
                    <br />
                    mL
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <Options
                label="Unidade da resposta"
                value={state.unit}
                options={(kind === "mass" ? ["g", "kg"] : ["mm", "cm", "m"]).map((unit) => ({
                  value: unit,
                  label: unit,
                }))}
                onChange={(unit) =>
                  update({
                    unit:
                      kind === "mass"
                        ? unit === "kg"
                          ? "kg"
                          : "g"
                        : unit === "mm"
                          ? "mm"
                          : unit === "m"
                            ? "m"
                            : "cm",
                  })
                }
              />
              <div className={panelClass}>
                {kind === "mass"
                  ? "1 kg = 1.000 g. A massa não muda quando trocamos a unidade."
                  : "1 m = 100 cm = 1.000 mm. O comprimento não muda quando trocamos a unidade."}
              </div>
            </>
          )}
        </>
      )}
      {!hideResults && <Output>{measureSummary(launch, state)}</Output>}
    </div>
  );
}
