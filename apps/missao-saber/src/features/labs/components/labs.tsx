"use client";
import { Label } from "@informach/ui/components/label";
import { cn } from "@informach/ui/lib/utils";
import { useId, useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { Etiqueta } from "@/components/ui/pagina";
import { gridMeasures, successiveDiscounts } from "../math";
import type { SavedExperiment } from "../schemas";
import { SaveExperiment } from "./save-experiment";

type LabProps = { profileId?: string; saved?: SavedExperiment };

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* A classe `lab` é mantida como gancho estável para os testes de ponta a
   ponta, que filtram cada ferramenta por ela. O estilo vem dos utilitários. */
const caixaLab = "lab rounded-card border-2 border-sombra bg-creme p-5 shadow-chapa";
const saidaLab = "mt-4 block rounded-controle bg-papel p-3.5 text-sm font-semibold text-tinta";
const legenda = "mt-3 text-xs text-tinta-suave";
const detalhe = "mt-3 text-sm";
const resumo = "cursor-pointer font-semibold text-tinta-suave underline underline-offset-4";
const controle =
  "mt-2 block w-full accent-[var(--ms-verde)] [&::-webkit-slider-thumb]:cursor-pointer";

/**
 * Previsão antes de mexer, observação depois de mexer.
 *
 * É o passo que faltava no ciclo do produto: sem uma aposta registrada, mexer
 * nos controles é brincar com o widget. As duas anotações são salvas junto com
 * a montagem, então voltam quando o estudante retoma o experimento.
 *
 * Nenhuma delas é corrigida: uma previsão errada é matéria-prima da descoberta,
 * não um erro a pontuar.
 */
function CicloDeDescoberta({
  pergunta,
  previsao,
  observacao,
  onPrevisao,
  onObservacao,
}: {
  pergunta: string;
  previsao: string;
  observacao: string;
  onPrevisao: (value: string) => void;
  onObservacao: (value: string) => void;
}) {
  /* `useId` em vez de um identificador fixo: dentro de uma missão a mesma
     ferramenta pode aparecer duas vezes na mesma tela — explorar antes de
     responder e a ferramenta de apoio das pistas —, e dois `id` iguais fariam
     o rótulo de uma cópia apontar para o campo da outra. */
  const campo = useId();
  return (
    <div className="mt-5 grid gap-3 rounded-controle border-2 border-dashed border-sombra p-3.5 sm:grid-cols-2">
      <div>
        <Label htmlFor={`previsao-${campo}`} className="block font-semibold">
          Qual é sua aposta? {pergunta}
        </Label>
        <textarea
          id={`previsao-${campo}`}
          rows={2}
          maxLength={280}
          value={previsao}
          onChange={(event) => onPrevisao(event.target.value)}
          className="mt-2 block w-full rounded-controle border-2 border-sombra bg-papel p-2.5 text-sm text-tinta"
        />
      </div>
      <div>
        <Label htmlFor={`observacao-${campo}`} className="block font-semibold">
          Depois de mexer, o que você observou?
        </Label>
        <textarea
          id={`observacao-${campo}`}
          rows={2}
          maxLength={280}
          value={observacao}
          onChange={(event) => onObservacao(event.target.value)}
          className="mt-2 block w-full rounded-controle border-2 border-sombra bg-papel p-2.5 text-sm text-tinta"
        />
      </div>
      <p className="text-xs text-tinta-suave sm:col-span-2">
        As duas linhas ficam salvas com o experimento. Previsão errada não conta erro: é ela que
        torna a observação interessante.
      </p>
    </div>
  );
}

export function BarsLab({ profileId, saved }: LabProps = {}) {
  const restored = saved?.state.kind === "bars" ? saved.state : undefined;
  const [initial, setInitial] = useState(restored?.initial ?? 200);
  const [first, setFirst] = useState(restored?.first ?? 20);
  const [second, setSecond] = useState(restored?.second ?? 10);
  const [previsao, setPrevisao] = useState(restored?.previsao ?? "");
  const [observacao, setObservacao] = useState(restored?.observacao ?? "");
  const result = successiveDiscounts(initial, first, second);
  return (
    <div className={caixaLab}>
      <Etiqueta tom="ceu">01 · Barras de referência</Etiqueta>
      <h3 className="mt-2.5 font-display text-xl font-semibold text-tinta">
        Um desconto, depois outro
      </h3>
      <p className="mt-1.5 text-sm text-tinta-suave">
        Faça uma previsão. O segundo desconto retira a mesma quantidade que retiraria do preço
        inicial?
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Label className="block font-semibold">
          Valor inicial: {money(initial)}
          <input
            type="range"
            min="20"
            max="500"
            step="10"
            value={initial}
            onChange={(e) => setInitial(Number(e.target.value))}
            className={controle}
          />
        </Label>
        <Label className="block font-semibold">
          Primeiro desconto: {first}%
          <input
            type="range"
            min="0"
            max="60"
            step="5"
            value={first}
            onChange={(e) => setFirst(Number(e.target.value))}
            className={controle}
          />
        </Label>
        <Label className="block font-semibold">
          Segundo desconto: {second}%
          <input
            type="range"
            min="0"
            max="60"
            step="5"
            value={second}
            onChange={(e) => setSecond(Number(e.target.value))}
            className={controle}
          />
        </Label>
      </div>
      {/* A barra precisa ocupar exatamente a fração do trilho: o teste mede
          largura da barra sobre largura do pai. Nada de padding aqui. */}
      <div className="mt-5 grid gap-2" aria-hidden="true">
        <div className="bar-track h-7 w-full overflow-hidden rounded-full bg-sombra/55">
          <div className="bar initial h-full w-full rounded-full bg-ceu" />
        </div>
        <div className="bar-track h-7 w-full overflow-hidden rounded-full bg-sombra/55">
          <div
            className="bar intermediate h-full rounded-full bg-uva"
            style={{ width: `${100 - first}%` }}
          />
        </div>
        <div className="bar-track h-7 w-full overflow-hidden rounded-full bg-sombra/55">
          <div
            className="bar final h-full rounded-full bg-verde"
            style={{ width: `${(result.final / initial) * 100}%` }}
          />
        </div>
      </div>
      <output className={saidaLab} aria-live="polite">
        De {money(initial)} para {money(result.intermediate)} e depois {money(result.final)}.
        Desconto total:{" "}
        {result.combinedPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%.
      </output>
      <details className={detalhe}>
        <summary className={resumo}>O que a barra mostra?</summary>
        <p className="mt-2 text-tinta">
          O segundo desconto usa {money(result.intermediate)} como base. Ele retira{" "}
          {money((result.intermediate * second) / 100)}. Somar as porcentagens usaria a mesma base
          duas vezes.
        </p>
      </details>
      <p className={legenda}>
        Teclado: use as setas nos controles. Abaixo das barras, o resultado também está em texto.
      </p>
      <CicloDeDescoberta
        pergunta="O desconto total será maior, igual ou menor que a soma dos dois?"
        previsao={previsao}
        observacao={observacao}
        onPrevisao={setPrevisao}
        onObservacao={setObservacao}
      />
      <SaveExperiment
        profileId={profileId}
        initialRevision={saved?.revision}
        state={{ kind: "bars", initial, first, second, previsao, observacao }}
      />
    </div>
  );
}

export function GridLab({ profileId, saved }: LabProps = {}) {
  const initialCells = () =>
    Array.from({ length: 20 }, (_, position) => ({ position, active: true }));
  const restored = saved?.state.kind === "grid" ? saved.state : undefined;
  const [cells, setCells] = useState(() =>
    restored ? restored.cells.map((active, position) => ({ active, position })) : initialCells(),
  );
  const [previsao, setPrevisao] = useState(restored?.previsao ?? "");
  const [observacao, setObservacao] = useState(restored?.observacao ?? "");
  const { area, perimeter } = gridMeasures(
    cells.map((cell) => cell.active),
    5,
  );
  return (
    <div className={caixaLab}>
      <Etiqueta tom="verde">02 · Malha de descobertas</Etiqueta>
      <h3 className="mt-2.5 font-display text-xl font-semibold text-tinta">
        A área muda. E o contorno?
      </h3>
      <p className="mt-1.5 text-sm text-tinta-suave">
        Retire um canto. Depois restaure a figura e retire uma peça no meio da borda. Antes de cada
        ação, tente prever a mudança.
      </p>
      <fieldset
        className="mx-auto mt-5 grid w-fit max-w-full grid-cols-5 gap-1.5 border-0 p-0"
        aria-label="Malha de quatro linhas e cinco colunas"
      >
        {cells.map(({ active, position }) => (
          <button
            key={position}
            type="button"
            aria-label={`Linha ${Math.floor(position / 5) + 1}, coluna ${(position % 5) + 1}`}
            aria-pressed={active}
            className={cn(
              "grid size-12 place-items-center rounded-lg border-2 text-lg transition-transform duration-100 active:translate-y-0.5 sm:size-14",
              active
                ? "border-verde-solido-sombra bg-verde-solido text-sobre-verde shadow-[0_3px_0_var(--ms-verde-solido-sombra)]"
                : "border-sombra bg-papel text-tinta-suave",
            )}
            onClick={() =>
              setCells(
                cells.map((cell) =>
                  cell.position === position ? { ...cell, active: !cell.active } : cell,
                ),
              )
            }
          >
            {active ? "●" : "+"}
          </button>
        ))}
      </fieldset>
      <output className={saidaLab} aria-live="polite">
        Área: {area} quadradinhos. Perímetro: {perimeter} lados unitários.
      </output>
      <BotaoChapa
        type="button"
        tom="contorno"
        medida="p"
        className="mt-3"
        onClick={() => setCells(initialCells())}
      >
        Restaurar retângulo
      </BotaoChapa>
      <details className={detalhe}>
        <summary className={resumo}>Conferir por contagem</summary>
        <p className="mt-2 text-tinta">
          Área = quantidade de células ocupadas. Perímetro = lados de células ocupadas que encostam
          no vazio ou fora da malha. Lados internos compartilhados não contam; bordas de buracos
          contam.
        </p>
      </details>
      <p className={legenda}>Cada célula é um botão: Tab navega, Espaço ativa ou retira.</p>
      <CicloDeDescoberta
        pergunta="Retirar um canto muda a área, o contorno, ou os dois?"
        previsao={previsao}
        observacao={observacao}
        onPrevisao={setPrevisao}
        onObservacao={setObservacao}
      />
      <SaveExperiment
        profileId={profileId}
        initialRevision={saved?.revision}
        state={{
          kind: "grid",
          cells: cells.map((cell) => cell.active),
          previsao,
          observacao,
        }}
      />
    </div>
  );
}

export function GroupsLab({ profileId, saved }: LabProps = {}) {
  const restored = saved?.state.kind === "groups" ? saved.state : undefined;
  const [groups, setGroups] = useState(restored?.groups ?? 4);
  const [tokens, setTokens] = useState(
    restored?.tokens ?? [0, 1, 2, 3, 0].map((box, id) => ({ id, box })),
  );
  const [previsao, setPrevisao] = useState(restored?.previsao ?? "");
  const [observacao, setObservacao] = useState(restored?.observacao ?? "");
  const counts = Array.from({ length: groups }, (_, id) => ({
    id,
    count: tokens.filter((token) => token.box === id).length,
  }));
  const seletor =
    "mt-1.5 block min-h-11 w-full rounded-controle border-2 border-sombra bg-papel px-3 font-semibold text-tinta";
  return (
    <div className={caixaLab}>
      <Etiqueta tom="sol">03 · Organizador de casos</Etiqueta>
      <h3 className="mt-2.5 font-display text-xl font-semibold text-tinta">
        É possível evitar a repetição?
      </h3>
      <p className="mt-1.5 text-sm text-tinta-suave">
        Distribua as peças entre caixas. Encontre a maior quantidade que ainda permite uma peça por
        caixa.
      </p>
      <Label className="mt-5 block max-w-56 font-semibold">
        Quantidade de caixas
        <select
          value={groups}
          className={seletor}
          onChange={(e) => {
            const next = Number(e.target.value);
            setGroups(next);
            setTokens(tokens.map((token) => ({ ...token, box: token.box % next })));
          }}
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Label>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {counts.map(({ count, id }) => (
          <div
            key={id}
            className="min-w-24 flex-1 rounded-card border-2 border-sol/45 bg-sol-claro p-3 text-center"
          >
            <span className="block font-display text-xs font-semibold text-tinta-suave uppercase">
              Caixa {id + 1}
            </span>
            <strong className="block font-display text-2xl text-tinta">{count}</strong>
            <span aria-hidden="true" className="block text-sm text-sol-fundo">
              {"● ".repeat(count)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tokens.map((token) => (
          <Label key={token.id} className="block font-semibold">
            Peça {token.id + 1}
            <select
              value={token.box}
              className={seletor}
              onChange={(e) =>
                setTokens(
                  tokens.map((current) =>
                    current.id === token.id ? { ...current, box: Number(e.target.value) } : current,
                  ),
                )
              }
            >
              {counts.map(({ id }) => (
                <option key={id} value={id}>
                  Caixa {id + 1}
                </option>
              ))}
            </select>
          </Label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BotaoChapa
          type="button"
          tom="contorno"
          medida="p"
          disabled={tokens.length >= 12}
          onClick={() => setTokens([...tokens, { id: (tokens.at(-1)?.id ?? -1) + 1, box: 0 }])}
        >
          + Uma peça
        </BotaoChapa>
        <BotaoChapa
          type="button"
          tom="contorno"
          medida="p"
          disabled={tokens.length <= 1}
          onClick={() => setTokens(tokens.slice(0, -1))}
        >
          Retirar última peça
        </BotaoChapa>
      </div>
      <output className={saidaLab} aria-live="polite">
        {tokens.length} peças em {groups} caixas. Nesta distribuição, a maior caixa tem{" "}
        {Math.max(...counts.map((box) => box.count))}. Em qualquer distribuição, alguma caixa terá
        pelo menos {Math.ceil(tokens.length / groups)}.
      </output>
      <p className={legenda}>
        Todos os movimentos também podem ser feitos com os seletores pelo teclado.
      </p>
      <CicloDeDescoberta
        pergunta="Com quantas peças alguma caixa é obrigada a receber duas?"
        previsao={previsao}
        observacao={observacao}
        onPrevisao={setPrevisao}
        onObservacao={setObservacao}
      />
      <SaveExperiment
        profileId={profileId}
        initialRevision={saved?.revision}
        state={{ kind: "groups", groups, tokens, previsao, observacao }}
      />
    </div>
  );
}

export function Lab({ kind }: { kind: "bars" | "grid" | "groups" }) {
  return kind === "bars" ? <BarsLab /> : kind === "grid" ? <GridLab /> : <GroupsLab />;
}
