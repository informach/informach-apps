"use client";
import { useState } from "react";
import type { LabToolProps } from "../types";
import { FractionNumberLine, FractionRegion } from "./fraction-representations";
import {
  type FractionStrip,
  fractionDefinition,
  fractionsSummary,
  paintedFraction,
  paintedMeasure,
  parseFractions,
} from "./fractions";
import { fractionText } from "./math";
import { buttonClass, NumberControl, Options, Output } from "./ui";

function FractionBar({
  strip,
  name,
  unit,
  fixedWhole,
  scaleWhole,
  reference,
  onChange,
  representation,
  hideResults,
}: {
  strip: FractionStrip;
  name: string;
  unit: string;
  fixedWhole?: boolean;
  scaleWhole: number;
  reference?: string;
  onChange: (strip: FractionStrip) => void;
  representation: "faixa" | "regiao" | "reta";
  hideResults?: boolean;
}) {
  const [selectedPart, setSelectedPart] = useState(0);
  const selection = Math.min(selectedPart, strip.pieces.length - 1);
  const total = strip.pieces.reduce((sum, piece) => sum + piece, 0);
  function divide(parts: number) {
    onChange({
      ...strip,
      pieces: Array.from({ length: parts }, () => 1),
      painted: Array.from({ length: parts }, () => false),
    });
  }
  return (
    <div className="space-y-3">
      <p className="font-semibold">
        {reference ?? `Faixa ${name}: o inteiro mede ${strip.whole} ${unit}`}
      </p>
      {!fixedWhole && (
        <NumberControl
          label={`Medida do inteiro ${name} em ${unit}`}
          value={strip.whole}
          min={1}
          max={4}
          onChange={(whole) => onChange({ ...strip, whole })}
        />
      )}
      {representation === "regiao" ? (
        <div style={{ width: `${(strip.whole / scaleWhole) * 100}%` }}>
          <FractionRegion
            strip={strip}
            name={name}
            onToggle={(part) =>
              onChange({
                ...strip,
                painted: strip.painted.map((value, index) => (index === part ? !value : value)),
              })
            }
          />
        </div>
      ) : representation === "reta" ? (
        <div style={{ width: `${(strip.whole / scaleWhole) * 100}%` }}>
          <FractionNumberLine
            strip={strip}
            name={name}
            unit={reference ? "inteiro" : unit}
            hideResults={hideResults}
          />
        </div>
      ) : (
        <div
          className="flex min-h-16 w-full"
          style={{ width: `${(strip.whole / scaleWhole) * 100}%` }}
        >
          {strip.pieces
            .map((weight, index) => ({ weight, index }))
            .map(({ weight, index }) => (
              <button
                type="button"
                key={index}
                aria-pressed={strip.painted[index]}
                aria-label={`Faixa ${name}, parte ${index + 1}: ${weight}/${total} do inteiro, ${strip.painted[index] ? "pintada" : "sem pintar"}`}
                className="min-h-16 min-w-0 border border-tinta text-center font-bold focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-tinta"
                style={{
                  flex: weight,
                  background: strip.painted[index] ? "#c8e6d4" : "#fff",
                  color: "#172e2a",
                }}
                onClick={() =>
                  onChange({
                    ...strip,
                    painted: strip.painted.map((value, position) =>
                      position === index ? !value : value,
                    ),
                  })
                }
              >
                {strip.painted[index] ? "■" : "·"}
              </button>
            ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Options
          label={`Selecionar parte da faixa ${name}`}
          value={String(selection)}
          options={strip.pieces
            .map((weight, index) => ({ weight, index }))
            .map(({ weight, index }) => ({
              value: String(index),
              label: `Parte ${index + 1}: ${weight}/${total} do inteiro${strip.painted[index] ? " — pintada" : ""}`,
            }))}
          onChange={(value) => setSelectedPart(Number(value))}
        />
        <button
          type="button"
          className={`${buttonClass} self-end`}
          onClick={() =>
            onChange({
              ...strip,
              painted: strip.painted.map((value, index) => (index === selection ? !value : value)),
            })
          }
        >
          {strip.painted[selection] ? "Apagar" : "Pintar"} parte {selection + 1} da faixa {name}
        </button>
      </div>
      {!hideResults && (
        <p className="text-sm">
          Pintado: {fractionText(paintedFraction(strip))} do inteiro
          {!reference && (
            <>
              {" "}
              = {fractionText(paintedMeasure(strip))} {unit}
            </>
          )}
          .
        </p>
      )}
      <p className="text-sm">Nova divisão (limpa a pintura desta faixa):</p>
      <div className="flex flex-wrap gap-2">
        {[2, 4, 8, 12].map((parts) => (
          <button className={buttonClass} type="button" key={parts} onClick={() => divide(parts)}>
            {parts} partes iguais
          </button>
        ))}
        <button
          type="button"
          className={buttonClass}
          onClick={() =>
            onChange({ ...strip, pieces: [1, 1, 2, 4], painted: [false, false, false, false] })
          }
        >
          Partes de tamanhos diferentes
        </button>
      </div>
    </div>
  );
}
export function FractionsTool({ launch, state: raw, onChange, hideResults }: LabToolProps) {
  const state = parseFractions(launch, raw);
  const definition = fractionDefinition(launch);
  const unit = definition.task === "add" ? "L" : "m";
  const collection = definition.task === "quantity" || definition.task === "inverse";
  const single =
    collection || definition.task === "complement" || launch.mode === "fracao-decimal-unidade";
  const scaleWhole = single ? state.first.whole : Math.max(state.first.whole, state.second.whole);
  return (
    <div className="space-y-5">
      <Options
        label="Representação da fração"
        value={state.representation}
        options={[
          { value: "faixa", label: "Faixa de comprimento" },
          { value: "regiao", label: "Região dividida em células" },
          { value: "reta", label: "Reta numérica" },
        ]}
        onChange={(representation) =>
          onChange({
            ...state,
            representation:
              representation === "regiao" ? "regiao" : representation === "reta" ? "reta" : "faixa",
          })
        }
      />
      {collection && (
        <NumberControl
          label={definition.task === "inverse" ? "Objetos na parte pintada" : "Objetos no inteiro"}
          value={state.quantity}
          min={1}
          max={120}
          onChange={(quantity) => onChange({ ...state, quantity })}
        />
      )}
      <p className="text-sm">
        Toque em uma parte para pintar ou apagar. O símbolo ■ indica as partes pintadas. As faixas
        usam a mesma escala de comprimento.
      </p>
      <FractionBar
        strip={state.first}
        name="A"
        unit={unit}
        scaleWhole={scaleWhole}
        representation={state.representation}
        hideResults={hideResults}
        fixedWhole={single}
        reference={
          collection
            ? definition.task === "inverse"
              ? `A parte pintada corresponde a ${state.quantity} objetos. O inteiro é desconhecido.`
              : `O inteiro representa ${state.quantity} objetos.`
            : definition.task === "complement"
              ? "O inteiro completo é toda a faixa; a pintura representa a parte usada."
              : undefined
        }
        onChange={(first) => onChange({ ...state, first })}
      />
      {!single && (
        <FractionBar
          strip={state.second}
          name="B"
          unit={unit}
          scaleWhole={scaleWhole}
          representation={state.representation}
          hideResults={hideResults}
          onChange={(second) => onChange({ ...state, second })}
        />
      )}
      {!hideResults && <Output>{fractionsSummary(launch, state)}</Output>}
    </div>
  );
}
