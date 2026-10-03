"use client";
import type { ToolLaunch } from "../types";
import { format } from "./math";
import { type RatiosState, ratioDefinition, recipeComparisons } from "./ratios";

export function RatioDoubleLine({
  launch,
  state,
  hideResults,
}: {
  launch: ToolLaunch;
  state: RatiosState;
  hideResults?: boolean;
}) {
  const kind = ratioDefinition(launch).kind;
  const share = kind === "share";
  const unit = kind === "unit";
  if (!share && !unit && kind !== "percent" && kind !== "fraction") return null;
  const factor = share ? state.factor : unit ? state.partA : Math.max(100, state.percent);
  const stops = [
    ...new Set([0, share || unit ? 1 : state.percent, factor, ...(share || unit ? [] : [100])]),
  ].sort((a, b) => a - b);
  const upper = (position: number) => (share ? position * state.partA : position);
  const lower = (position: number) =>
    share
      ? position * state.partB
      : unit
        ? (position * state.base) / state.partA
        : (position * (kind === "fraction" ? 1 : state.base)) / 100;
  const topName = share
    ? "Ingrediente A"
    : unit
      ? launch.mode === "taxa-unitaria"
        ? "Litros"
        : "Horas"
      : "Porcentagem";
  const bottomName = share ? "Ingrediente B" : unit ? "Quilômetros" : "Quantidade";
  const label = (position: number) =>
    hideResults && position !== 0 && (unit ? position !== state.partA : !share && position !== 100)
      ? "?"
      : format(lower(position));
  return (
    <div className="rounded-controle border-2 border-sombra p-3">
      <p className="font-semibold">Dupla reta: pares de grandezas proporcionais</p>
      <svg
        viewBox="0 0 520 170"
        className="w-full"
        role="img"
        aria-label={`${topName} e ${bottomName}, com origens alinhadas. ${stops.map((position) => `${format(upper(position))} corresponde a ${label(position)}`).join("; ")}. A mesma multiplicação leva de um par ao outro.`}
      >
        <text x={12} y={20} fontSize={13}>
          {topName}
        </text>
        <text x={12} y={158} fontSize={13}>
          {bottomName}
        </text>
        {[55, 115].map((y) => (
          <line key={y} x1={30} x2={490} y1={y} y2={y} stroke="#172e2a" strokeWidth={2} />
        ))}
        {stops.map((position) => {
          const x = 30 + (position / factor) * 460;
          return (
            <g key={position}>
              <line x1={x} x2={x} y1={48} y2={122} stroke="#176344" strokeDasharray="4 3" />
              <text x={x} y={40} fontSize={13} textAnchor="middle">
                {format(upper(position))}
              </text>
              <text x={x} y={142} fontSize={13} textAnchor="middle">
                {label(position)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RecipeComparison({
  state,
  hideResults,
}: {
  state: RatiosState;
  hideResults?: boolean;
}) {
  const recipes = recipeComparisons(state);
  const maximum = Math.max(...recipes.map((recipe) => recipe.a + recipe.b));
  return (
    <div className="space-y-3 rounded-controle border-2 border-sombra p-3">
      <p className="font-semibold">Multiplicar ou somar muda a mistura?</p>
      {recipes.map((recipe) => (
        <div key={recipe.label}>
          <p className="text-sm">
            {recipe.label}: A = {recipe.a}, B = {recipe.b}
          </p>
          <div
            className="flex h-10 border border-tinta"
            style={{ width: `${((recipe.a + recipe.b) / maximum) * 100}%` }}
            aria-hidden="true"
          >
            <span
              className="flex items-center justify-center bg-emerald-100"
              style={{ flex: recipe.a }}
            >
              A
            </span>
            <span
              className="flex items-center justify-center bg-amber-100"
              style={{ flex: recipe.b }}
            >
              B
            </span>
          </div>
          {!hideResults && (
            <p className="text-sm">
              {recipe.preservesRatio ? "Preserva a razão original." : "Muda a razão original."}
            </p>
          )}
        </div>
      ))}
      <p className="text-sm">
        Se A e B já forem iguais, somar a mesma quantidade também mantém 1:1. Teste quantidades
        diferentes antes de generalizar.
      </p>
    </div>
  );
}
