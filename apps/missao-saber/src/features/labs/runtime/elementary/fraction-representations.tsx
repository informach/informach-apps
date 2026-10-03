"use client";
import type { FractionStrip } from "./fractions";
import { fractionText, rational } from "./math";

export function FractionRegion({
  strip,
  name,
  onToggle,
}: {
  strip: FractionStrip;
  name: string;
  onToggle: (part: number) => void;
}) {
  const cells = strip.pieces.flatMap((weight, part) =>
    Array.from({ length: weight }, (_, cell) => ({ part, cell })),
  );
  let columns = Math.ceil(Math.sqrt(cells.length));
  while (cells.length % columns !== 0) columns++;
  return (
    <fieldset
      className="grid h-40"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label={`Região ${name}. Células de mesma área; células com o mesmo número formam uma parte.`}
    >
      {cells.map(({ part, cell }) => (
        <button
          key={`${part}-${cell}`}
          type="button"
          className="min-w-0 border border-tinta text-sm font-bold focus-visible:outline-4 focus-visible:outline-tinta"
          style={{ background: strip.painted[part] ? "#c8e6d4" : "#fff" }}
          aria-label={`Região ${name}, parte ${part + 1}, célula ${cell + 1}. ${strip.painted[part] ? "Pintada" : "Sem pintar"}.`}
          aria-pressed={strip.painted[part]}
          onClick={() => onToggle(part)}
        >
          {part + 1}
          {strip.painted[part] ? "■" : "·"}
        </button>
      ))}
    </fieldset>
  );
}

export function FractionNumberLine({
  strip,
  name,
  unit,
  hideResults,
}: {
  strip: FractionStrip;
  name: string;
  unit: string;
  hideResults?: boolean;
}) {
  const total = strip.pieces.reduce((sum, value) => sum + value, 0);
  let offset = 0;
  const intervals = strip.pieces.map((weight, index) => {
    const start = offset;
    offset += weight;
    return { start, end: offset, index };
  });
  return (
    <svg
      viewBox="0 0 480 125"
      role="img"
      className="w-full"
      aria-label={`Reta ${name}, de 0 a ${strip.whole} ${unit}. ${intervals.map(({ start, end, index }) => `Parte ${index + 1}: ${hideResults ? `${end - start} de ${total} intervalos iguais do inteiro` : `de ${fractionText(rational(BigInt(start * strip.whole), BigInt(total)))} a ${fractionText(rational(BigInt(end * strip.whole), BigInt(total)))}`}; ${strip.painted[index] ? "marcada" : "sem marcar"}`).join(". ")}`}
    >
      <line x1={20} x2={460} y1={50} y2={50} stroke="#172e2a" strokeWidth={2} />
      {intervals.map(({ start, end, index }) => (
        <g key={index}>
          <line
            x1={20 + (start / total) * 440}
            x2={20 + (end / total) * 440}
            y1={50}
            y2={50}
            stroke={strip.painted[index] ? "#176344" : "#d8dfda"}
            strokeWidth={strip.painted[index] ? 12 : 5}
          />
          <line
            x1={20 + (start / total) * 440}
            x2={20 + (start / total) * 440}
            y1={38}
            y2={63}
            stroke="#172e2a"
          />
          <text
            x={20 + ((start + end) / (2 * total)) * 440}
            y={30}
            textAnchor="middle"
            fontSize={12}
          >
            {index + 1}
            {strip.painted[index] ? "■" : ""}
          </text>
        </g>
      ))}
      <line x1={460} x2={460} y1={38} y2={63} stroke="#172e2a" />
      <text x={20} y={85} textAnchor="middle" fontSize={14}>
        0
      </text>
      <text x={460} y={85} textAnchor="end" fontSize={14}>
        {strip.whole} {unit}
      </text>
      <text x={240} y={113} textAnchor="middle" fontSize={12}>
        Mesma unidade, intervalos proporcionais às partes.
      </text>
    </svg>
  );
}
