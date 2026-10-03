"use client";

import type { LabToolProps } from "../types";
import {
  absoluteEndpoints,
  advancedEquationSummary,
  nonlinearSolutions,
  parseAdvancedEquation,
  radicalSolutions,
  substitutedSolutions,
} from "./advanced-equations";
import {
  AdvancedFrame,
  CartesianPlot,
  Choice,
  Range,
  slots,
  useAdvancedState,
} from "./advanced-ui";
import { equationGivenSummary } from "./equation-given-summary";
import { formatNumber } from "./math";
import {
  factoredCoefficients,
  fractionText,
  polynomialDivision,
  polynomialText,
  polynomialValue,
} from "./polynomial-math";

const sample = (fn: (x: number) => number, low = -10, high = 10) =>
  Array.from({ length: 201 }, (_, i) => {
    const x = low + ((high - low) * i) / 200;
    return { x, y: fn(x) };
  });
export function AdvancedEquationTool(props: LabToolProps) {
  const { state: s, update, error } = useAdvancedState(props, parseAdvancedEquation);
  return (
    <AdvancedFrame
      summary={
        props.hideResults ? equationGivenSummary(props.launch, s) : advancedEquationSummary(s)
      }
      error={error}
      disabled={props.disabled}
    >
      {s.kind === "polynomial" && (
        <>
          <CartesianPlot
            curves={[
              {
                id: "polynomial",
                label: `P(x)=${polynomialText(s.coefficients)}`,
                points: sample((x) => polynomialValue(s.coefficients, x)),
                color: "#247a58",
              },
            ]}
            points={
              props.hideResults ? [] : [{ x: s.input, y: polynomialValue(s.coefficients, s.input) }]
            }
            label="Polinômio e entrada de teste"
          />
          <Choice
            label="Tarefa"
            value={s.target}
            options={[
              { value: "value", label: "Valor de P na entrada" },
              { value: "degree", label: "Grau de P" },
              { value: "coefficient-sum", label: "Soma dos coeficientes: P(1)" },
              { value: "remainder", label: "Valor do resto R na entrada" },
              { value: "quotient", label: "Valor do quociente Q na entrada" },
              { value: "candidates", label: "Todos os candidatos a raízes racionais" },
            ]}
            onChange={(target) => update({ target })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {slots(6).map((slot) => (
              <Range
                key={slot}
                label={`P: coeficiente de x^${slot - 1}`}
                value={s.coefficients[slot - 1] ?? 0}
                min={-20}
                max={20}
                onChange={(value) =>
                  update({
                    coefficients: s.coefficients.map((old, index) =>
                      index === slot - 1 ? value : old,
                    ),
                  })
                }
              />
            ))}
            {slots(3).map((slot) => (
              <Range
                key={`divisor-${slot}`}
                label={`D: coeficiente de x^${slot - 1}`}
                value={s.divisor[slot - 1] ?? 0}
                min={-6}
                max={6}
                onChange={(value) =>
                  update({
                    divisor: s.divisor.map((old, index) => (index === slot - 1 ? value : old)),
                  })
                }
              />
            ))}
          </div>
          <Range
            label="Entrada x"
            value={s.input}
            min={-5}
            max={5}
            step={0.5}
            onChange={(input) => update({ input })}
          />
          {!props.hideResults && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <caption className="mb-2 text-left font-semibold">
                  Divisão exata P = D·Q + R; coeficientes por potência
                </caption>
                <thead>
                  <tr>
                    <th>Polinômio</th>
                    {slots(6).map((slot) => (
                      <th key={slot}>x^{slot - 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: "Q", values: polynomialDivision(s.coefficients, s.divisor).quotient },
                    { id: "R", values: polynomialDivision(s.coefficients, s.divisor).remainder },
                  ].map(({ id, values }) => (
                    <tr key={id}>
                      <th>{id}</th>
                      {slots(6).map((slot) => (
                        <td key={slot} className="border p-2 text-center">
                          {values.slice(slot - 1, slot).map(fractionText)[0] ?? "0"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm">
            Para procurar raízes racionais, use divisores do termo independente sobre divisores do
            coeficiente líder. Cancele fatores x antes de tratar o caso de termo independente zero;
            x=0 já é uma raiz.
          </p>
        </>
      )}
      {s.kind === "roots" && (
        <>
          <CartesianPlot
            curves={[
              {
                id: "factored",
                label: props.hideResults
                  ? equationGivenSummary(props.launch, s)
                  : `P(x)=${polynomialText(factoredCoefficients(s.roots, s.leading))}`,
                points: sample((x) => polynomialValue(factoredCoefficients(s.roots, s.leading), x)),
                color: "#247a58",
              },
            ]}
            points={props.hideResults ? [] : [...new Set(s.roots)].map((x) => ({ x, y: 0 }))}
            label="Raízes e multiplicidades"
          />
          <Choice
            label="Tarefa"
            value={s.target}
            options={[
              { value: "roots", label: "Lista das raízes distintas" },
              { value: "sum", label: "Soma das raízes" },
              { value: "product", label: "Produto das raízes" },
              { value: "pairs", label: "Soma dos produtos dois a dois" },
              { value: "squares", label: "Soma dos quadrados das raízes" },
              { value: "reciprocals", label: "Soma dos inversos das raízes" },
              { value: "coefficient", label: "Coeficiente da potência escolhida" },
            ]}
            onChange={(target) => update({ target })}
          />
          <Range
            label="Quantidade de fatores"
            value={s.roots.length}
            min={1}
            max={5}
            onChange={(length) =>
              update({ roots: slots(length).map((slot) => s.roots[slot - 1] ?? 1) })
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {slots(s.roots.length).map((slot) => (
              <Range
                key={slot}
                label={`Raiz do fator ${slot}`}
                value={s.roots[slot - 1] ?? 0}
                min={-5}
                max={5}
                onChange={(value) =>
                  update({ roots: s.roots.map((old, index) => (index === slot - 1 ? value : old)) })
                }
              />
            ))}
            <Range
              label="Coeficiente líder (não zero)"
              value={s.leading}
              min={-4}
              max={4}
              onChange={(leading) => update({ leading })}
            />
            {s.target === "coefficient" && (
              <Range
                label="Potência do coeficiente pedido"
                value={s.coefficient}
                min={0}
                max={5}
                onChange={(coefficient) => update({ coefficient })}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[...new Set(s.roots)].map((root) => (
              <span key={root} className="rounded border-2 border-sombra p-2 text-sm">
                Raiz {root}; multiplicidade {s.roots.filter((value) => value === root).length}
              </span>
            ))}
          </div>
          <p className="text-sm">
            O coeficiente imediatamente abaixo do líder é −a·(soma das raízes); o seguinte é a·(soma
            dos produtos dois a dois). O termo independente inclui o sinal (−1)^grau.
          </p>
        </>
      )}
      {s.kind === "power" && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-controle border-2 border-sombra bg-creme p-4 text-lg">
            <span>
              {s.factor}·x^{s.exponent}+({s.constant})
            </span>
            <span>→ substituir x={s.root} →</span>
            <span>
              {s.factor}·({s.root})^{s.exponent}+({s.constant})
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label="Expoente inteiro"
              value={s.exponent}
              min={1}
              max={100}
              onChange={(exponent) => update({ exponent })}
            />
            <Range
              label="Raiz r do divisor x−r"
              value={s.root}
              min={-3}
              max={3}
              onChange={(root) => update({ root })}
            />
            <Range
              label="Coeficiente da potência"
              value={s.factor}
              min={-5}
              max={5}
              onChange={(factor) => update({ factor })}
            />
            <Range
              label="Termo constante"
              value={s.constant}
              min={-10}
              max={10}
              onChange={(constant) => update({ constant })}
            />
          </div>
          {!props.hideResults && (
            <section
              className="flex flex-wrap gap-2"
              aria-label="Primeiras potências da raiz do divisor"
            >
              {slots(6).map((power) => (
                <span className="rounded border p-2 text-sm" key={power}>
                  ({s.root})^{power} = {s.root ** power}
                </span>
              ))}
            </section>
          )}
          <p className="text-sm">
            Para base −1, cada multiplicação troca o sinal: expoente par dá 1 e ímpar dá −1. O
            expoente não é reduzido pelo período quando a base tem módulo diferente de 1.
          </p>
        </>
      )}
      {s.kind === "identity" && (
        <>
          <Choice
            label="Expressão pedida"
            value={s.target}
            options={[
              { value: "squares", label: "a²+b² usando soma e produto" },
              { value: "cubes", label: "a³+b³ usando soma e produto" },
              { value: "difference", label: "(a−b)² usando soma e produto" },
              { value: "difference-squares", label: "a²−b² como (a−b)(a+b)" },
            ]}
            onChange={(target) => update({ target })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {s.target === "difference-squares" ? (
              <>
                <Range
                  label="a"
                  value={s.left}
                  min={-20}
                  max={20}
                  onChange={(left) => update({ left })}
                />
                <Range
                  label="b"
                  value={s.right}
                  min={-20}
                  max={20}
                  onChange={(right) => update({ right })}
                />
              </>
            ) : (
              <>
                <Range
                  label="Soma a+b"
                  value={s.sum}
                  min={-20}
                  max={20}
                  onChange={(sum) => update({ sum })}
                />
                <Range
                  label="Produto ab"
                  value={s.product}
                  min={-100}
                  max={100}
                  onChange={(product) => update({ product })}
                />
              </>
            )}
          </div>
          {!props.hideResults && (
            <div className="grid gap-2 rounded-controle border-2 border-sombra p-3 sm:grid-cols-3">
              <div className="bg-creme p-3 text-center">
                {s.target === "difference-squares"
                  ? `a−b = ${s.left - s.right}`
                  : `(a+b)² = ${s.sum ** 2}`}
              </div>
              <div className="bg-creme p-3 text-center">
                {s.target === "difference-squares"
                  ? `a+b = ${s.left + s.right}`
                  : `2ab = ${2 * s.product}`}
              </div>
              <div className="bg-creme p-3 text-center">
                {s.target === "difference-squares"
                  ? "Multiplicar as duas faixas"
                  : "Separar a²+b² de 2ab"}
              </div>
            </div>
          )}
          <p className="text-sm">
            Identidades valem para todos os reais; áreas físicas exigem medidas não negativas. Para
            x+1/x, use a=x, b=1/x e ab=1, com x≠0.
          </p>
        </>
      )}
      {s.kind === "radical" && (
        <>
          <CartesianPlot
            curves={[
              {
                id: "radical",
                label: "Verde: raiz quadrada principal",
                points: sample((x) => s.a * x + s.b)
                  .filter((point) => point.y >= 0)
                  .map((point) => ({ x: point.x, y: Math.sqrt(point.y) })),
                color: "#247a58",
              },
              {
                id: "line",
                label: "Azul: lado direito",
                points: sample((x) => s.c * x + s.d),
                color: "#385cb0",
              },
            ]}
            points={
              props.hideResults
                ? []
                : radicalSolutions(s).solutions.map((x) => ({ x, y: s.c * x + s.d }))
            }
            label="Interseções da raiz e da reta"
            xMin={-10}
            xMax={10}
            yMin={-10}
            yMax={10}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label="a em √(ax+b), diferente de zero"
              value={s.a}
              min={-5}
              max={5}
              onChange={(a) => update({ a })}
            />
            <Range
              label="b dentro da raiz"
              value={s.b}
              min={-12}
              max={12}
              onChange={(b) => update({ b })}
            />
            <Range label="c em cx+d" value={s.c} min={-3} max={3} onChange={(c) => update({ c })} />
            <Range
              label="d fora da raiz"
              value={s.d}
              min={-12}
              max={12}
              onChange={(d) => update({ d })}
            />
          </div>
          {!props.hideResults && (
            <table className="w-full text-sm">
              <caption>Conferir os candidatos da equação elevada ao quadrado</caption>
              <thead>
                <tr>
                  <th>Candidato x</th>
                  <th>ax+b</th>
                  <th>cx+d</th>
                  <th>Serve na original?</th>
                </tr>
              </thead>
              <tbody>
                {radicalSolutions(s).candidates.map((x) => (
                  <tr key={x}>
                    <td>{formatNumber(x)}</td>
                    <td>{formatNumber(s.a * x + s.b)}</td>
                    <td>{formatNumber(s.c * x + s.d)}</td>
                    <td>
                      {radicalSolutions(s).solutions.includes(x) ? "sim" : "não: domínio ou sinal"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {s.kind === "substitution" && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <CartesianPlot
              curves={[
                {
                  id: "outer",
                  label: "Equação em t",
                  points: sample((t) => s.a * t ** 2 + s.b * t + s.c),
                  color: "#247a58",
                },
              ]}
              points={
                props.hideResults
                  ? []
                  : substitutedSolutions(s).intermediate.map((x) => ({ x, y: 0 }))
              }
              label="Primeira etapa: raízes em t"
              xMin={-10}
              xMax={10}
              yMin={-10}
              yMax={10}
            />
            <CartesianPlot
              curves={[
                {
                  id: "inner",
                  label: "t=x²+kx",
                  points: sample((x) => x ** 2 + s.innerLinear * x),
                  color: "#247a58",
                },
                ...(props.hideResults ? [] : substitutedSolutions(s).intermediate).map((t) => ({
                  id: `level-${t}`,
                  label: `Nível t=${formatNumber(t)}`,
                  points: [
                    { x: -10, y: t },
                    { x: 10, y: t },
                  ],
                  color: "#385cb0",
                })),
              ]}
              label="Segunda etapa: retornar de t a x"
              xMin={-10}
              xMax={10}
              yMin={-10}
              yMax={10}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Range
              label="Coeficiente de t², diferente de zero"
              value={s.a}
              min={-4}
              max={4}
              onChange={(a) => update({ a })}
            />
            <Range
              label="Coeficiente de t"
              value={s.b}
              min={-16}
              max={16}
              onChange={(b) => update({ b })}
            />
            <Range
              label="Termo constante"
              value={s.c}
              min={-20}
              max={20}
              onChange={(c) => update({ c })}
            />
            <Range
              label="k na substituição t=x²+kx"
              value={s.innerLinear}
              min={-6}
              max={6}
              onChange={(innerLinear) => update({ innerLinear })}
            />
          </div>
          <p className="text-sm">
            Se k=0, t=x² exige t≥0. Se k≠0, use o mínimo de x²+kx para decidir quais t podem
            ocorrer.
          </p>
        </>
      )}
      {s.kind === "absolute" && (
        <>
          <CartesianPlot
            curves={[
              {
                id: "absolute",
                label: s.target === "minimum" ? "Soma das distâncias" : "Módulo",
                points: sample(
                  (x) =>
                    s.target === "minimum"
                      ? Math.abs(x - s.p) + Math.abs(x - s.q)
                      : Math.abs(s.a * x + s.b),
                  -15,
                  15,
                ),
                color: "#247a58",
              },
              ...(s.target === "minimum"
                ? []
                : [
                    {
                      id: "radius",
                      label: "Raio indicado",
                      points: [
                        { x: -15, y: s.radius },
                        { x: 15, y: s.radius },
                      ],
                      color: "#385cb0",
                    },
                  ]),
            ]}
            points={
              props.hideResults
                ? []
                : s.target === "minimum"
                  ? [{ x: s.probe, y: Math.abs(s.probe - s.p) + Math.abs(s.probe - s.q) }]
                  : absoluteEndpoints(s).map((x) => ({ x, y: s.radius }))
            }
            label="Módulo, distância e fronteiras"
            xMin={-15}
            xMax={15}
            yMin={-4}
            yMax={25}
          />
          <Choice
            label="Tarefa"
            value={s.target}
            options={[
              { value: "equation", label: "Equação |ax+b|=r: soluções" },
              { value: "strict", label: "Inequação |ax+b|<r: intervalo aberto" },
              { value: "closed", label: "Inequação |ax+b|≤r: intervalo fechado" },
              { value: "minimum", label: "Menor soma de duas distâncias" },
            ]}
            onChange={(target) => update({ target })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {s.target === "minimum" ? (
              <>
                <Range
                  label="Ponto p"
                  value={s.p}
                  min={-10}
                  max={10}
                  onChange={(p) => update({ p })}
                />
                <Range
                  label="Ponto q"
                  value={s.q}
                  min={-10}
                  max={10}
                  onChange={(q) => update({ q })}
                />
                <Range
                  label="Mova x"
                  value={s.probe}
                  min={-15}
                  max={15}
                  step={0.5}
                  onChange={(probe) => update({ probe })}
                />
              </>
            ) : (
              <>
                <Range
                  label="Coeficiente a, diferente de zero"
                  value={s.a}
                  min={-4}
                  max={4}
                  onChange={(a) => update({ a })}
                />
                <Range
                  label="Termo b"
                  value={s.b}
                  min={-10}
                  max={10}
                  onChange={(b) => update({ b })}
                />
                <Range
                  label="Raio r (negativo testa impossibilidade)"
                  value={s.radius}
                  min={-4}
                  max={12}
                  onChange={(radius) => update({ radius })}
                />
              </>
            )}
          </div>
          {!props.hideResults && (
            <p className="text-sm">
              Fronteiras:{" "}
              {absoluteEndpoints(s).map(formatNumber).join("; ") ||
                "não existem para raio negativo"}
              . [ ] inclui pontas; ] [ exclui. A origem dos colchetes não altera a reta, mas altera
              o conjunto solução.
            </p>
          )}
        </>
      )}
      {s.kind === "nonlinear" && (
        <>
          <CartesianPlot
            curves={
              s.model === "line-circle"
                ? [
                    {
                      id: "circle",
                      label: "Circunferência",
                      points: Array.from({ length: 161 }, (_, index) => ({
                        x: s.centerX + s.radius * Math.cos((index * 2 * Math.PI) / 160),
                        y: s.centerY + s.radius * Math.sin((index * 2 * Math.PI) / 160),
                      })),
                      color: "#247a58",
                    },
                    {
                      id: "line",
                      label: "Reta",
                      points: sample((x) => s.slope * x + s.intercept, -16, 16),
                      color: "#385cb0",
                    },
                  ]
                : [
                    {
                      id: "sum",
                      label: "x+y=S",
                      points: sample((x) => s.sum - x, -16, 16),
                      color: "#385cb0",
                    },
                    ...(s.product === 0
                      ? [
                          {
                            id: "product-horizontal",
                            label: "xy=0: eixo horizontal",
                            points: [
                              { x: -16, y: 0 },
                              { x: 16, y: 0 },
                            ],
                            color: "#247a58",
                          },
                          {
                            id: "product-vertical",
                            label: "xy=0: eixo vertical",
                            points: [
                              { x: 0, y: -16 },
                              { x: 0, y: 16 },
                            ],
                            color: "#247a58",
                          },
                        ]
                      : [
                          {
                            id: "product-negative",
                            label: "xy=P, ramo x<0",
                            points: sample((x) => s.product / x, -16, -0.05),
                            color: "#247a58",
                          },
                          {
                            id: "product-positive",
                            label: "xy=P, ramo x>0",
                            points: sample((x) => s.product / x, 0.05, 16),
                            color: "#247a58",
                          },
                        ]),
                  ]
            }
            points={props.hideResults ? [] : nonlinearSolutions(s)}
            label="Interseções das duas condições"
            xMin={-16}
            xMax={16}
            yMin={-16}
            yMax={16}
          />
          <Choice
            label="Modelo do sistema"
            value={s.model}
            options={[
              { value: "sum-product", label: "Soma e produto de dois números" },
              { value: "line-circle", label: "Reta e circunferência" },
            ]}
            onChange={(model) => update({ model })}
          />
          <Choice
            label="Resposta pedida"
            value={s.target}
            options={[
              { value: "count", label: "Quantidade de pares reais" },
              { value: "pairs", label: "Lista de pares x; y" },
            ]}
            onChange={(target) => update({ target })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {s.model === "sum-product" ? (
              <>
                <Range
                  label="Soma S"
                  value={s.sum}
                  min={-12}
                  max={12}
                  onChange={(sum) => update({ sum })}
                />
                <Range
                  label="Produto P"
                  value={s.product}
                  min={-20}
                  max={20}
                  onChange={(product) => update({ product })}
                />
              </>
            ) : (
              <>
                <Range
                  label="Inclinação da reta"
                  value={s.slope}
                  min={-3}
                  max={3}
                  onChange={(slope) => update({ slope })}
                />
                <Range
                  label="Intercepto da reta"
                  value={s.intercept}
                  min={-8}
                  max={8}
                  onChange={(intercept) => update({ intercept })}
                />
                <Range
                  label="Raio"
                  value={s.radius}
                  min={1}
                  max={10}
                  onChange={(radius) => update({ radius })}
                />
                <Range
                  label="Centro: x"
                  value={s.centerX}
                  min={-5}
                  max={5}
                  onChange={(centerX) => update({ centerX })}
                />
                <Range
                  label="Centro: y"
                  value={s.centerY}
                  min={-5}
                  max={5}
                  onChange={(centerY) => update({ centerY })}
                />
              </>
            )}
          </div>
        </>
      )}
    </AdvancedFrame>
  );
}
