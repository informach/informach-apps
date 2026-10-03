"use client";
import { useId } from "react";
import type { LabToolProps } from "../types";
import { Frame, panel, positions, Select, Slider, useTool } from "./controls";
import { equationGivenSummary } from "./equation-given-summary";
import {
  balanceModes,
  type EquationState,
  equationSummary,
  parseEquation,
  polynomialModes,
  systemModes,
} from "./equations";
import { formatNumber } from "./math";

function Balance({
  s,
  known,
  hideResults,
}: {
  s: EquationState;
  known: boolean;
  hideResults?: boolean;
}) {
  const x = known ? s.p : s.probe;
  const left = s.a * x + s.b,
    right = s.c * x + s.d;
  const tilt = Math.sign(left - right) * 12;
  const id = useId();
  return (
    <svg viewBox="0 0 400 205" role="img" aria-labelledby={id} className="w-full max-w-xl">
      <title id={id}>
        {hideResults
          ? `Balança: ${s.a} caixas e ${s.b} unidades à esquerda; ${s.c} caixas e ${s.d} unidades à direita.${known ? ` Cada caixa vale ${x}.` : ""}`
          : `Balança: ${left} unidades à esquerda e ${right} à direita, com cada caixa valendo ${x}.`}
      </title>
      <path d="M200 84 L173 166 L227 166 Z" fill="#e5b04a" stroke="#243846" strokeWidth="3" />
      <line x1="64" y1={84 + tilt} x2="336" y2={84 - tilt} stroke="#243846" strokeWidth="5" />
      {[
        { x: 100, y: 84 + tilt * 0.73, count: s.a, units: s.b, total: left },
        { x: 300, y: 84 - tilt * 0.73, count: s.c, units: s.d, total: right },
      ].map((side) => (
        <g key={side.x}>
          <line
            x1={side.x}
            x2={side.x}
            y1={side.y}
            y2={side.y + 32}
            stroke="#243846"
            strokeWidth="2"
          />
          <path
            d={`M${side.x - 68} ${side.y + 32} Q${side.x} ${side.y + 68} ${side.x + 68} ${side.y + 32} Z`}
            fill="#d9eaf2"
            stroke="#243846"
            strokeWidth="2"
          />
          <text x={side.x} y={side.y - 20} textAnchor="middle" fontSize="15" fill="#243846">
            {side.count} caixas + {side.units}
          </text>
          {!hideResults && (
            <text x={side.x} y={side.y + 86} textAnchor="middle" fontSize="16" fill="#243846">
              Total: {formatNumber(side.total)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
function PolynomialTiles({
  s,
  mode,
  hideResults,
}: {
  s: EquationState;
  mode: string;
  hideResults?: boolean;
}) {
  const coefficients =
    mode === "identidades"
      ? [1, 2 * s.p, s.p ** 2]
      : ["girard", "fatoracao-raizes"].includes(mode)
        ? [1, -(s.p + s.q), s.p * s.q]
        : [s.a, s.b, s.c];
  return (
    <div className="space-y-3">
      {hideResults && ["identidades", "girard", "fatoracao-raizes"].includes(mode) ? (
        <p className="font-mono">
          {mode === "identidades" ? `(x+(${s.p}))²` : `(x−(${s.p}))(x−(${s.q}))`}
        </p>
      ) : (
        <>
          <p className="font-mono text-base">
            {coefficients[0]}x² + ({coefficients[1]})x + ({coefficients[2]})
          </p>
          <div className="flex flex-wrap gap-5">
            {coefficients
              .map((coefficient, index) => ({ coefficient, power: 2 - index }))
              .map(({ coefficient, power }) => (
                <div key={power}>
                  <p className="mb-2 text-sm">
                    {["Unidades", "Retângulos x", "Quadrados x²"][power]}: {coefficient}
                  </p>
                  <section
                    className="flex max-w-52 flex-wrap gap-1"
                    aria-label={`${coefficient} peças do termo ${["constante", "x", "x ao quadrado"][power]}`}
                  >
                    {positions(Math.min(Math.abs(coefficient ?? 0), 20)).map((position) => (
                      <span
                        key={position}
                        aria-hidden="true"
                        className={`flex items-center justify-center border-2 border-sombra text-xs font-bold ${power === 2 ? "h-10 w-10" : power === 1 ? "h-10 w-4" : "h-4 w-4"} ${(coefficient ?? 0) < 0 ? "bg-orange-100" : "bg-sky-100"}`}
                      >
                        {(coefficient ?? 0) < 0 ? "−" : "+"}
                      </span>
                    ))}
                    {Math.abs(coefficient ?? 0) > 20 && (
                      <span className="text-xs">… {Math.abs(coefficient ?? 0)} peças no total</span>
                    )}
                  </section>
                </div>
              ))}
          </div>
        </>
      )}
      <p className="text-xs">
        Os sinais estão escritos nas peças: são termos algébricos com sinal, sem massa nem área
        física negativa.
      </p>
      {mode === "identidades" && (
        <div className="grid max-w-sm grid-cols-[2fr_1fr] gap-1 text-center">
          <div className="border-2 border-sombra bg-sky-100 p-7">x²</div>
          <div className="border-2 border-sombra bg-amber-100 p-7">{s.p}x</div>
          <div className="border-2 border-sombra bg-amber-100 p-4">{s.p}x</div>
          <div className="border-2 border-sombra bg-emerald-100 p-4">
            {hideResults ? `${s.p}²` : s.p ** 2}
          </div>
        </div>
      )}
      {mode === "divisao-e-resto" && !hideResults && (
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm">
            <caption className="mb-2 text-left">
              Divisão por x − {s.p}: cada coluna soma o coeficiente com o produto anterior.
            </caption>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Coeficiente de x²</th>
                <th>Coeficiente de x</th>
                <th>Constante</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Coeficientes</th>
                <td>{s.a}</td>
                <td>{s.b}</td>
                <td>{s.c}</td>
              </tr>
              <tr>
                <th>Produto por {s.p}</th>
                <td>—</td>
                <td>{s.a * s.p}</td>
                <td>{(s.b + s.a * s.p) * s.p}</td>
              </tr>
              <tr>
                <th>Quociente e resto</th>
                <td>{s.a}</td>
                <td>{s.b + s.a * s.p}</td>
                <td>{s.c + (s.b + s.a * s.p) * s.p}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
export function EquationTool(props: LabToolProps) {
  const { state: s, update, error } = useTool(props, parseEquation);
  const mode = props.launch.mode;
  const physical = balanceModes.includes(mode),
    polynomial = polynomialModes.includes(mode),
    system = systemModes.includes(mode);
  const weights = ["trocas-equivalentes", "ordenar-pesos"].includes(mode);
  const special = ["modulo-radicais-e-dominio", "exponenciais-logaritmos", "inequacoes"].includes(
    mode,
  );
  return (
    <Frame
      disabled={props.disabled}
      error={error}
      summary={
        props.hideResults ? equationGivenSummary(props.launch, s) : equationSummary(props.launch, s)
      }
    >
      <div className={panel}>
        {physical && !weights && (
          <Balance
            s={s}
            known={["comparar-pratos", "massas"].includes(mode)}
            hideResults={props.hideResults}
          />
        )}
        {weights && (
          <div className="flex flex-wrap items-end gap-4">
            {[
              { name: "A", weight: s.p },
              { name: "B", weight: s.q },
              { name: "C", weight: s.d },
            ]
              .slice(0, mode === "ordenar-pesos" ? 3 : 2)
              .map(({ name, weight }) => (
                <div key={name} className="flex flex-col items-center gap-2">
                  <div
                    style={{ height: weight * 8 + 24 }}
                    className="flex w-20 items-center justify-center rounded-controle border-2 border-sombra bg-sky-100 font-bold"
                  >
                    {name}
                  </div>
                  <span>{weight} unidades</span>
                </div>
              ))}
          </div>
        )}
        {polynomial && <PolynomialTiles s={s} mode={mode} hideResults={props.hideResults} />}
        {system && (
          <div className="space-y-3">
            <p className="font-mono">
              {s.a}x + ({s.b})y = {s.c}
            </p>
            <p className="font-mono">
              {s.d}x + ({s.e})y = {s.f}
            </p>
            {!props.hideResults && (
              <>
                <p className="text-sm">
                  Com x = {s.probe} e y = {s.p}: a primeira soma vale{" "}
                  {formatNumber(s.a * s.probe + s.b * s.p)}; a segunda vale{" "}
                  {formatNumber(s.d * s.probe + s.e * s.p)}.
                </p>
                <p className="text-sm">
                  Multiplicar a primeira linha por {s.d} e a segunda por {s.a}, depois subtrair,
                  elimina x: ({s.b * s.d - s.e * s.a})y = {s.c * s.d - s.f * s.a}.
                </p>
              </>
            )}
          </div>
        )}
        {!physical && !polynomial && !system && !special && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center font-mono">
              <div className="rounded border-2 border-sombra p-3">
                {s.a}x + ({s.b})
              </div>
              <span>=</span>
              <div className="rounded border-2 border-sombra p-3">
                {s.c}x + ({s.d})
              </div>
            </div>
            <p className="font-mono text-sm">
              Após a mesma operação: ({s.a}x + {s.b} + {s.added})/{s.scale} = ({s.c}x + {s.d} +{" "}
              {s.added})/{s.scale}
            </p>
            {!props.hideResults && (
              <>
                <p className="text-sm">
                  Substituindo x por {s.probe}, os lados originais valem{" "}
                  {formatNumber(s.a * s.probe + s.b)} e {formatNumber(s.c * s.probe + s.d)}.
                </p>
                <p className="text-sm">
                  Distribuir e agrupar: {s.a}·(x + 2) = {s.a}x + {2 * s.a}. Para representar o lado
                  atual, acrescente {s.b - 2 * s.a}.
                </p>
              </>
            )}
          </div>
        )}
        {mode === "modulo-radicais-e-dominio" && s.domainKind === "raiz" && (
          <div className="space-y-3">
            <p className="font-mono text-lg">
              √(x + {s.a}) = {s.b}
            </p>
            {!props.hideResults && (
              <>
                <p>Domínio: x ≥ {-s.a}. O lado esquerdo é sempre não negativo.</p>
                <p>
                  Quadrado dos lados → x + {s.a} = {s.b ** 2} → candidato x = {s.b ** 2 - s.a}.
                </p>
              </>
            )}
            <p>
              Conferência no original: √({s.b ** 2}) = {Math.abs(s.b)}.{" "}
              {s.b < 0
                ? "O candidato não resolve a equação original."
                : "O candidato respeita o sinal e o domínio."}
            </p>
          </div>
        )}
        {mode === "exponenciais-logaritmos" && (
          <div className="space-y-3">
            <p className="font-mono text-lg">
              {s.a}
              <sup>x</sup> = {s.b}
            </p>
            {!props.hideResults && (
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="rounded border border-sombra p-2 text-sm">
                    {s.a}
                    <sup>{n}</sup> = {s.a ** n}
                  </div>
                ))}
              </div>
            )}
            <p>O logaritmo encontra o expoente; o alvo pode ficar entre duas potências inteiras.</p>
          </div>
        )}
        {mode === "inequacoes" && (
          <div className="space-y-3">
            <p className="font-mono text-lg">
              {s.a}x + {s.b} &lt; {s.c}
            </p>
            {!props.hideResults && (
              <>
                <p>
                  Teste x = {s.probe}: {s.a * s.probe + s.b} &lt; {s.c} é{" "}
                  {s.a * s.probe + s.b < s.c ? "verdadeiro" : "falso"}.
                </p>
                <svg
                  viewBox="0 0 400 70"
                  role="img"
                  aria-label={`Solução: x ${s.a > 0 ? "menor" : "maior"} que ${formatNumber((s.c - s.b) / s.a)}; extremo aberto.`}
                >
                  <line x1="25" y1="25" x2="375" y2="25" stroke="#243846" strokeWidth="2" />
                  <line
                    x1={s.a > 0 ? 25 : 200}
                    y1="25"
                    x2={s.a > 0 ? 200 : 375}
                    y2="25"
                    stroke="#087f5b"
                    strokeWidth="7"
                  />
                  <circle cx="200" cy="25" r="7" fill="white" stroke="#087f5b" strokeWidth="3" />
                  <text x="200" y="58" textAnchor="middle" fontSize="16">
                    {formatNumber((s.c - s.b) / s.a)}
                  </text>
                </svg>
              </>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "ordenar-pesos" && (
          <Slider
            label="Massa da caixa C"
            value={s.d}
            min={0}
            max={30}
            onChange={(d) => update({ d })}
          />
        )}
        {mode === "modulo-radicais-e-dominio" && (
          <>
            <Select
              label="Operação e domínio"
              value={s.domainKind}
              options={[
                { value: "raiz", label: "Raiz quadrada: √(x+a)=b" },
                { value: "modulo", label: "Módulo: |x+a|=b" },
              ]}
              onChange={(domainKind) => {
                if (domainKind === "raiz" || domainKind === "modulo") update({ domainKind });
              }}
            />
            {s.domainKind === "modulo" && (
              <div className="sm:col-span-2">
                <p className="font-mono">
                  |x + {s.a}| = {s.b}
                </p>
                {!props.hideResults && (
                  <>
                    <p className="mt-2 text-sm">
                      Distância {s.b} até o ponto {-s.a}.{" "}
                      {s.b < 0
                        ? "Uma distância negativa não existe."
                        : `Pontos candidatos: ${-s.a - s.b} e ${-s.a + s.b}.`}
                    </p>
                    <svg
                      viewBox="0 0 360 70"
                      role="img"
                      aria-label={`Centro ${-s.a}; pontos a distância ${Math.abs(s.b)} para a esquerda e direita.`}
                    >
                      <line x1="25" y1="25" x2="335" y2="25" stroke="#243846" strokeWidth="2" />
                      <circle cx="180" cy="25" r="5" fill="#243846" />
                      <text x="180" y="60" textAnchor="middle" fontSize="14">
                        {-s.a}
                      </text>
                      {s.b >= 0 && (
                        <>
                          <circle cx={180 - s.b * 4} cy="25" r="6" fill="#087f5b" />
                          <circle cx={180 + s.b * 4} cy="25" r="6" fill="#087f5b" />
                        </>
                      )}
                    </svg>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {weights || ["fatoracao-raizes", "girard", "identidades"].includes(mode) ? (
          <>
            <Slider
              label={physical ? "Massa da caixa A (p)" : "Parâmetro p"}
              value={s.p}
              min={physical ? 1 : -8}
              max={8}
              onChange={(p) => update({ p })}
            />
            {mode !== "identidades" && (
              <Slider
                label={physical ? "Massa da caixa B (q)" : "Parâmetro q"}
                value={s.q}
                min={physical ? 1 : -8}
                max={8}
                onChange={(q) => update({ q })}
              />
            )}
          </>
        ) : (
          <>
            <Slider
              label={
                physical
                  ? "Caixas à esquerda"
                  : mode === "exponenciais-logaritmos"
                    ? "Base a"
                    : "Coeficiente a"
              }
              value={s.a}
              min={physical ? 1 : mode === "exponenciais-logaritmos" ? 2 : -10}
              max={physical ? 8 : 10}
              onChange={(a) => update({ a })}
            />
            <Slider
              label={
                physical
                  ? "Unidades à esquerda"
                  : mode === "exponenciais-logaritmos"
                    ? "Alvo b"
                    : "Coeficiente b"
              }
              value={s.b}
              min={physical ? 0 : mode === "exponenciais-logaritmos" ? 1 : -15}
              max={30}
              onChange={(b) => update({ b })}
            />
            {!["modulo-radicais-e-dominio", "exponenciais-logaritmos"].includes(mode) && (
              <Slider
                label={
                  physical
                    ? "Caixas à direita"
                    : system
                      ? "Resultado da primeira equação (c)"
                      : "Coeficiente c"
                }
                value={s.c}
                min={physical ? 0 : -15}
                max={physical ? 8 : 30}
                onChange={(c) => update({ c })}
              />
            )}
            {!polynomial && !special && (
              <Slider
                label={physical ? "Unidades à direita" : "Coeficiente d"}
                value={s.d}
                min={physical ? 0 : -15}
                max={30}
                onChange={(d) => update({ d })}
              />
            )}
            {mode === "divisao-e-resto" && (
              <Slider
                label="Divisor x − p: valor de p"
                value={s.p}
                min={-8}
                max={8}
                onChange={(p) => update({ p })}
              />
            )}
            {system && (
              <>
                <Slider label="Coeficiente e" value={s.e} onChange={(e) => update({ e })} />
                <Slider
                  label="Resultado da segunda equação (f)"
                  value={s.f}
                  min={-30}
                  max={30}
                  onChange={(f) => update({ f })}
                />
                <Slider
                  label="y de teste"
                  value={s.p}
                  min={-8}
                  max={8}
                  onChange={(p) => update({ p })}
                />
              </>
            )}
            {physical && ["comparar-pratos", "massas"].includes(mode) ? (
              <Slider
                label="Massa de cada caixa"
                value={s.p}
                min={1}
                max={8}
                onChange={(p) => update({ p })}
              />
            ) : (
              !polynomial &&
              !["modulo-radicais-e-dominio", "exponenciais-logaritmos"].includes(mode) && (
                <Slider
                  label="x de teste"
                  value={s.probe}
                  min={physical ? 0 : -15}
                  max={20}
                  step={0.5}
                  onChange={(probe) => update({ probe })}
                />
              )
            )}
          </>
        )}
        {!physical && !polynomial && !system && !special && (
          <>
            <Slider
              label="Somar o mesmo valor aos dois lados"
              value={s.added}
              min={-20}
              max={20}
              onChange={(added) => update({ added })}
            />
            <Slider
              label="Dividir os dois lados pelo mesmo valor"
              value={s.scale}
              min={1}
              max={6}
              onChange={(scale) => update({ scale })}
            />
          </>
        )}
      </div>
    </Frame>
  );
}
