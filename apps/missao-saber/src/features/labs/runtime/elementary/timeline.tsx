"use client";
import { clockText, durationSegments, type MeasureState } from "./measures";

export function DurationTimeline({
  state,
  hideResults,
}: {
  state: MeasureState;
  hideResults?: boolean;
}) {
  const segments = durationSegments(state);
  const end = state.endMinute + (state.nextDay ? 1440 : 0);
  const duration = end - state.startMinute;
  const time = (minute: number) =>
    `${clockText(minute % 1440)}${minute >= 1440 ? " do dia seguinte" : ""}`;
  const x = (minute: number) =>
    duration === 0 ? 30 : 30 + ((minute - state.startMinute) / duration) * 580;
  return (
    <div className="rounded-controle border-2 border-sombra p-3">
      <p className="font-semibold">Linha do tempo</p>
      <svg
        viewBox="0 0 640 110"
        role="img"
        className="w-full"
        aria-label={`Linha do tempo de ${time(state.startMinute)} até ${time(end)}. Os trechos separam completar a hora, horas inteiras e minutos finais.`}
      >
        <line x1={30} x2={610} y1={50} y2={50} stroke="#172e2a" strokeWidth={2} />
        {segments.map((segment, index) => (
          <g key={segment.from}>
            <line
              x1={x(segment.from)}
              x2={x(segment.to)}
              y1={50}
              y2={50}
              stroke={index % 2 ? "#994711" : "#176344"}
              strokeWidth={8}
            />
            <line x1={x(segment.from)} x2={x(segment.from)} y1={35} y2={65} stroke="#172e2a" />
            <text
              x={(x(segment.from) + x(segment.to)) / 2}
              y={index % 2 ? 28 : 83}
              textAnchor="middle"
              fontSize={13}
            >
              {index + 1}
            </text>
          </g>
        ))}
        <text x={30} y={103} fontSize={12}>
          {time(state.startMinute)}
        </text>
        <text x={610} y={103} textAnchor="end" fontSize={12}>
          {time(end)}
        </text>
      </svg>
      <ol className="list-inside list-decimal space-y-1 text-sm">
        {segments.map((segment) => (
          <li key={segment.from}>
            {time(segment.from)} → {time(segment.to)}
            {!hideResults &&
              `: ${segment.minutes % 60 === 0 ? `${segment.minutes / 60} hora(s)` : `${segment.minutes} minutos`}`}
          </li>
        ))}
      </ol>
      {duration === 0 && <p className="text-sm">Os dois horários coincidem no mesmo dia.</p>}
      <p className="mt-2 text-sm">
        Uma hora tem 60 minutos. Some os trechos sem contar o início duas vezes.
      </p>
    </div>
  );
}
