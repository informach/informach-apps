"use client";
import { useId, useMemo, useState } from "react";
import type { LabToolProps } from "../types";
import { button, Check, Frame, panel, Select, Slider, useTool } from "./controls";
import {
  functionExpression,
  functionPoint,
  functionSummary,
  graphSegments,
  operationDomain,
  operationPoint,
  operationSegments,
  parseFunction,
} from "./functions";
import { expressionDomainCuts, expressionPoint, formatNumber } from "./math";

function ExpressionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    [draft, setDraft] = useState(value),
    [message, setMessage] = useState("");
  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className="font-semibold">
        Expressão personalizada
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 grow rounded border-2 border-sombra bg-papel p-2 font-mono"
        />
        <button
          type="button"
          className={button}
          onClick={() => {
            try {
              expressionDomainCuts(draft);
              setMessage("");
              onChange(draft);
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Expressão inválida.");
            }
          }}
        >
          Aplicar expressão
        </button>
      </div>
      <p className="mt-1 text-xs">
        Use x, números, +, −, *, /, ^, sqrt(...), abs(...) ou log(...) na base 10. Exemplo: 1/(x-1).
        Para desenhar todos os cortes do domínio corretamente, denominadores e argumentos de
        sqrt/log devem ser afins (como x−1); o expoente deve ser um inteiro fixo entre −12 e 12.
      </p>
      {message && (
        <p role="alert" className="mt-2 text-sm text-red-900">
          {message}
        </p>
      )}
    </div>
  );
}
export function FunctionTool(props: LabToolProps) {
  const { state: s, update, error } = useTool(props, parseFunction);
  const mode = props.launch.mode;
  const segments = useMemo(
    () => (mode === "circunferencia" ? [] : graphSegments(props.launch, s)),
    [mode, props.launch, s],
  );
  const showSecond =
    ["intersecoes", "intersecoes-sistemas"].includes(mode) ||
    (mode === "modelar-compor-inverter" && s.operation === "compose");
  const customExpression = mode === "relacao-dominio-imagem" && s.shape === "expression";
  const operation = mode === "modelar-compor-inverter";
  const operationLabel = s.operation === "compose" ? "f(g(x))" : "f⁻¹(x)";
  const operationLine = operation ? operationSegments(s) : [];
  const rows = [-2, -1, 0, 1, 2, s.input].filter((x, index, array) => array.indexOf(x) === index);
  const point = operation ? operationPoint(s, s.input) : functionPoint(props.launch, s, s.input);
  const toScreenX = (x: number) => 190 + x * 16,
    toScreenY = (y: number) => 190 - y * 16;
  const graphId = useId();
  return (
    <Frame disabled={props.disabled} error={error} summary={functionSummary(props.launch, s)}>
      <div className={panel}>
        <p className="mb-3 break-words font-mono text-sm">
          {mode === "circunferencia"
            ? `(x − ${s.a})² + (y − ${s.b})² = ${s.c ** 2}`
            : `f(x) = ${functionExpression(props.launch, s)}`}
        </p>
        {showSecond && (
          <p className="mb-3 font-mono text-sm">
            g(x) = {s.secondSlope}x + {s.secondIntercept}
          </p>
        )}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <svg viewBox="0 0 380 390" role="img" aria-labelledby={graphId} className="w-full">
            <title
              id={graphId}
            >{`${functionSummary(props.launch, s)} Janela visível: x e y entre −10 e 10; valores fora da janela continuam existindo.`}</title>
            <defs>
              <clipPath id={`${graphId}-clip`}>
                <rect x="30" y="30" width="320" height="320" />
              </clipPath>
            </defs>
            {Array.from({ length: 11 }, (_, index) => index * 2 - 10).map((n) => (
              <g key={n}>
                <line
                  x1={toScreenX(n)}
                  x2={toScreenX(n)}
                  y1="30"
                  y2="350"
                  stroke={n === 0 ? "#243846" : "#dce2e5"}
                />
                <line
                  x1="30"
                  x2="350"
                  y1={toScreenY(n)}
                  y2={toScreenY(n)}
                  stroke={n === 0 ? "#243846" : "#dce2e5"}
                />
                <text x={toScreenX(n)} y="371" textAnchor="middle" fontSize="11" fill="#243846">
                  {n}
                </text>
                <text x="20" y={toScreenY(n) + 4} textAnchor="end" fontSize="11" fill="#243846">
                  {n}
                </text>
              </g>
            ))}
            <g clipPath={`url(#${graphId}-clip)`}>
              {mode === "circunferencia" ? (
                <>
                  <circle
                    cx={toScreenX(s.a)}
                    cy={toScreenY(s.b)}
                    r={s.c * 16}
                    fill="none"
                    stroke="#087f5b"
                    strokeWidth="3"
                  />
                  <circle cx={toScreenX(s.a)} cy={toScreenY(s.b)} r="4" fill="#243846" />
                  <line
                    x1={toScreenX(s.a)}
                    y1={toScreenY(s.b)}
                    x2={toScreenX(s.input)}
                    y2={toScreenY(s.secondIntercept)}
                    stroke="#b54b16"
                    strokeDasharray="4 4"
                  />
                  <circle
                    cx={toScreenX(s.input)}
                    cy={toScreenY(s.secondIntercept)}
                    r="6"
                    fill="#b54b16"
                  />
                </>
              ) : (
                <>
                  {segments.map((points) =>
                    points.length === 1 && points[0] ? (
                      <circle
                        key={points[0].x}
                        cx={toScreenX(points[0].x)}
                        cy={toScreenY(points[0].y)}
                        r="3"
                        fill="#087f5b"
                      />
                    ) : (
                      <polyline
                        key={points[0]?.x}
                        points={points.map((p) => `${toScreenX(p.x)},${toScreenY(p.y)}`).join(" ")}
                        fill="none"
                        stroke="#087f5b"
                        strokeWidth="3"
                      />
                    ),
                  )}
                  {showSecond && (
                    <line
                      x1={toScreenX(-10)}
                      x2={toScreenX(10)}
                      y1={toScreenY(-10 * s.secondSlope + s.secondIntercept)}
                      y2={toScreenY(10 * s.secondSlope + s.secondIntercept)}
                      stroke="#a85016"
                      strokeWidth="3"
                      strokeDasharray="6 4"
                    />
                  )}
                  {operationLine.length > 0 && (
                    <polyline
                      points={operationLine
                        .map((p) => `${toScreenX(p.x)},${toScreenY(p.y)}`)
                        .join(" ")}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="3"
                      strokeDasharray="3 3"
                    />
                  )}
                  {operation && s.operation === "inverse" && (
                    <line
                      x1="30"
                      y1="350"
                      x2="350"
                      y2="30"
                      stroke="#64748b"
                      strokeDasharray="6 4"
                    />
                  )}
                  {operation &&
                    operationDomain(s)?.map(({ x, included }) => {
                      const y =
                        s.operation === "compose"
                          ? s.a * (s.secondSlope * x + s.secondIntercept) + s.b
                          : (x - s.b) / s.a;
                      return (
                        <circle
                          key={`operation-${x}`}
                          cx={toScreenX(x)}
                          cy={toScreenY(y)}
                          r="5"
                          fill={included ? "#7c3aed" : "white"}
                          stroke="#7c3aed"
                          strokeWidth="2"
                        />
                      );
                    })}
                  {point.value !== undefined && !props.hideResults && (
                    <circle
                      cx={toScreenX(s.input)}
                      cy={toScreenY(point.value)}
                      r="6"
                      fill={operation ? "#7c3aed" : "#087f5b"}
                      stroke="white"
                      strokeWidth="2"
                    />
                  )}
                  {[
                    { x: s.domainMin, included: s.includeMin },
                    { x: s.domainMax, included: s.includeMax },
                  ].map(({ x, included }) => {
                    const result = expressionPoint(functionExpression(props.launch, s), x);
                    return result.value === undefined ? null : (
                      <circle
                        key={x}
                        cx={toScreenX(x)}
                        cy={toScreenY(result.value)}
                        r="5"
                        fill={included ? "#087f5b" : "white"}
                        stroke="#087f5b"
                        strokeWidth="2"
                      />
                    );
                  })}
                </>
              )}
            </g>
            <text x="365" y="185" fontSize="13">
              x
            </text>
            <text x="196" y="20" fontSize="13">
              y
            </text>
          </svg>
          {mode !== "circunferencia" && (
            <div className="space-y-3">
              {!props.hideResults && (
                <table className="w-full text-sm">
                  <caption className="mb-2 text-left font-semibold">
                    {operation
                      ? `Entrada → ${operationLabel}`
                      : "Entrada → saída no domínio escolhido"}
                  </caption>
                  <thead>
                    <tr>
                      <th className="p-2 text-left">x</th>
                      {operation && s.operation === "compose" && (
                        <th className="p-2 text-left">g(x)</th>
                      )}
                      <th className="p-2 text-left">{operation ? operationLabel : "f(x)"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((x) => {
                      const result = operation
                        ? operationPoint(s, x)
                        : functionPoint(props.launch, s, x);
                      return (
                        <tr key={x}>
                          <td className="border-t border-sombra p-2">{formatNumber(x)}</td>
                          {operation && s.operation === "compose" && (
                            <td className="border-t border-sombra p-2">
                              {formatNumber(s.secondSlope * x + s.secondIntercept)}
                            </td>
                          )}
                          <td className="border-t border-sombra p-2">
                            {result.value === undefined
                              ? result.limit
                                ? "fora dos limites"
                                : result.error === "sem inversa"
                                  ? "sem inversa"
                                  : "fora do domínio"
                              : formatNumber(result.value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {point.error && !props.hideResults && (
                <p className="text-sm">Na entrada atual: {point.error}</p>
              )}
              <p className="text-xs">
                A linha contínua representa f; a tracejada, quando presente, representa g. Círculo
                vazio exclui um extremo. A janela corta valores fora de −10 a 10; ausência na janela
                não significa inexistência.
              </p>
              {operation && (
                <p className="text-sm">
                  A curva roxa pontilhada representa {operationLabel}.
                  {s.operation === "inverse"
                    ? " A reta cinza é y=x: f e sua inversa se refletem nela."
                    : " O domínio da composição mantém as entradas cuja saída de g pertence ao domínio de f."}
                </p>
              )}
              {operation && !props.hideResults && (
                <p className="text-sm">
                  {s.operation === "compose"
                    ? `Etapa 1: g(${s.input}) = ${formatNumber(s.secondSlope * s.input + s.secondIntercept)}. Essa saída entra em f.`
                    : `Recuperar a entrada: resolver ${s.a}·x + ${s.b} = ${s.input}, respeitando o domínio de f.`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {!customExpression && (
          <Slider
            label={mode === "circunferencia" ? "Centro: coordenada x" : "Parâmetro a"}
            value={s.a}
            min={-5}
            max={5}
            step={0.5}
            onChange={(a) => update({ a })}
          />
        )}
        {!customExpression && (
          <Slider
            label={mode === "circunferencia" ? "Centro: coordenada y" : "Parâmetro b"}
            value={s.b}
            min={-8}
            max={8}
            onChange={(b) => update({ b })}
          />
        )}
        {!customExpression &&
          !(mode === "relacao-dominio-imagem" && s.shape === "linear") &&
          !["afim", "retas-inclinacao", "intersecoes-sistemas", "modelar-compor-inverter"].includes(
            mode,
          ) && (
            <Slider
              label={mode === "circunferencia" ? "Raio" : "Parâmetro c"}
              value={s.c}
              min={mode === "circunferencia" ? 1 : -8}
              max={8}
              onChange={(c) => update({ c })}
            />
          )}
        <Slider
          label={mode === "circunferencia" ? "Ponto de teste: x" : "Entrada x"}
          value={s.input}
          min={-10}
          max={10}
          step={0.5}
          onChange={(input) => update({ input })}
        />
        {(showSecond || mode === "circunferencia") && (
          <>
            <Slider
              label={mode === "circunferencia" ? "Ponto de teste: y" : "Intercepto de g"}
              value={s.secondIntercept}
              min={-8}
              max={8}
              onChange={(secondIntercept) => update({ secondIntercept })}
            />
            {showSecond && (
              <Slider
                label="Inclinação de g"
                value={s.secondSlope}
                min={-4}
                max={4}
                step={0.5}
                onChange={(secondSlope) => update({ secondSlope })}
              />
            )}
          </>
        )}
        {mode !== "circunferencia" && (
          <>
            <Slider
              label="Início do domínio escolhido"
              value={s.domainMin}
              min={-10}
              max={s.domainMax - 1}
              onChange={(domainMin) => update({ domainMin })}
            />
            <Slider
              label="Fim do domínio escolhido"
              value={s.domainMax}
              min={s.domainMin + 1}
              max={10}
              onChange={(domainMax) => update({ domainMax })}
            />
            <Check checked={s.includeMin} onChange={(includeMin) => update({ includeMin })}>
              Incluir extremo inicial
            </Check>
            <Check checked={s.includeMax} onChange={(includeMax) => update({ includeMax })}>
              Incluir extremo final
            </Check>
          </>
        )}
        {mode === "modelar-compor-inverter" && (
          <Check
            checked={s.operation === "inverse"}
            onChange={(inverse) => update({ operation: inverse ? "inverse" : "compose" })}
          >
            Investigar inversa (desmarcado: composição)
          </Check>
        )}
        {mode === "relacao-dominio-imagem" && (
          <>
            <Select
              label="Regra da máquina"
              value={s.shape}
              options={[
                { value: "linear", label: "Afim: a·x+b" },
                { value: "quadratic", label: "Quadrática: a·x²+b·x+c" },
                { value: "reciprocal", label: "Recíproca: a/(x−b)+c" },
                { value: "sqrt", label: "Raiz: a·√(x−b)+c" },
                { value: "log", label: "Logaritmo: a·log₁₀(x−b)+c" },
                { value: "expression", label: "Expressão personalizada" },
              ]}
              onChange={(shape) => {
                if (
                  shape === "linear" ||
                  shape === "quadratic" ||
                  shape === "reciprocal" ||
                  shape === "sqrt" ||
                  shape === "log" ||
                  shape === "expression"
                )
                  update({ shape });
              }}
            />
            {s.shape === "expression" && (
              <ExpressionEditor
                key={s.expression}
                value={s.expression}
                onChange={(expression) => update({ expression })}
              />
            )}
          </>
        )}
      </div>
    </Frame>
  );
}
