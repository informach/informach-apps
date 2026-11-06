"use client";
import { ArrowDown, ArrowUp, Minus, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { Icone } from "@/components/icone";
import { ICONES_TAREFA } from "@/domain/modelos";
import { DIAS_CURTOS, type Passo, periodoDe } from "@/domain/rotina";
import { apagarTarefaAction, salvarTarefaAction } from "../actions";
import { GravadorDeVoz } from "./gravador";

type Inicial = {
  id: string | null;
  title: string;
  icon: string;
  time: string;
  days: number;
  durationMin: number | null;
  stars: number;
  steps: Passo[];
  needs: string[];
  thenText: string | null;
  detail: string | null;
  remind: boolean;
  requiresApproval: boolean;
  hasVoice: boolean;
};

const campo =
  "h-12 w-full rounded-xl border-2 border-linha-forte bg-white px-3 font-bold text-tinta placeholder:font-semibold placeholder:text-tinta-suave";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="cartao flex flex-col gap-3 p-4">
      <h2 className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">{titulo}</h2>
      {children}
    </section>
  );
}

function Interruptor({
  rotulo,
  ajuda,
  ligado,
  aoMudar,
}: {
  rotulo: string;
  ajuda?: string;
  ligado: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="font-bold">{rotulo}</p>
        {ajuda && <p className="text-sm font-semibold text-tinta-suave">{ajuda}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => aoMudar(!ligado)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${ligado ? "bg-folha-botao" : "bg-linha-forte"}`}
      >
        <span
          className={`absolute top-1 size-6 rounded-full bg-white transition-all ${ligado ? "left-7" : "left-1"}`}
        />
      </button>
    </div>
  );
}

function Contador({
  rotulo,
  valor,
  min,
  max,
  passo = 1,
  sufixo,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo?: number;
  sufixo?: string;
  aoMudar: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 font-bold">{rotulo}</span>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-xl border-2 border-linha-forte bg-white"
        aria-label={`Menos ${rotulo.toLowerCase()}`}
        onClick={() => aoMudar(Math.max(min, valor - passo))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-16 text-center font-display text-xl font-extrabold" aria-live="polite">
        {valor === 0 && sufixo === "min" ? "sem" : valor}
        {sufixo && valor !== 0 ? ` ${sufixo}` : ""}
      </span>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-xl border-2 border-linha-forte bg-white"
        aria-label={`Mais ${rotulo.toLowerCase()}`}
        onClick={() => aoMudar(Math.min(max, valor + passo))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function EditorDeTarefa({
  childId,
  childName,
  inicial,
  podeGravar,
}: {
  childId: string;
  childName: string;
  inicial: Inicial;
  podeGravar: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [t, setT] = useState(inicial);
  const [separar, setSeparar] = useState(inicial.needs.join(", "));
  const [apagando, setApagando] = useState(false);
  const { pendente, erro, rodar } = useAcao();
  const muda = (patch: Partial<Inicial>) => setT((x) => ({ ...x, ...patch }));
  const voltar = `/rotinas?crianca=${childId}&periodo=${periodoDe(t.time)}`;

  function salvar() {
    rodar(
      () =>
        salvarTarefaAction({
          id: t.id ?? undefined,
          childId,
          task: {
            title: t.title.trim() || "Tarefa",
            icon: t.icon,
            time: t.time,
            days: t.days,
            durationMin: t.durationMin ?? 0,
            stars: t.stars,
            steps: t.steps.filter((p) => p.text.trim()),
            needs: separar
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean),
            thenText: t.thenText ?? "",
            detail: t.detail ?? "",
            remind: t.remind,
            requiresApproval: t.requiresApproval,
          },
        }),
      () => router.push(voltar),
    );
  }

  function moverPasso(i: number, d: -1 | 1) {
    const passos = [...t.steps];
    const j = i + d;
    if (j < 0 || j >= passos.length) return;
    [passos[i], passos[j]] = [passos[j] as Passo, passos[i] as Passo];
    muda({ steps: passos });
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Link
          href={voltar}
          aria-label="Fechar"
          className="grid size-11 place-items-center rounded-full text-tinta-suave"
        >
          <X className="size-6" aria-hidden="true" />
        </Link>
        <div className="flex-1">
          <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">
            {childName.toUpperCase()}
          </p>
          <h1 className="font-display text-2xl font-extrabold leading-tight">
            {t.id ? "Editar tarefa" : "Nova tarefa"}
          </h1>
        </div>
        <button type="button" className="bp bp-ceu" disabled={pendente} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </header>

      <Secao titulo="NOME E ÍCONE">
        <label className="sr-only" htmlFor={`${ids}-nome`}>
          Nome da tarefa
        </label>
        <input
          id={`${ids}-nome`}
          className={campo}
          value={t.title}
          maxLength={40}
          placeholder="Ex.: Tomar banho"
          onChange={(e) => muda({ title: e.target.value })}
        />
        <fieldset className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 min-w-0">
          <legend className="sr-only">Ícone</legend>
          {ICONES_TAREFA.map((nome) => (
            <button
              key={nome}
              type="button"
              aria-pressed={t.icon === nome}
              aria-label={nome}
              onClick={() => muda({ icon: nome })}
              className={`grid aspect-square place-items-center rounded-xl border-2 ${
                t.icon === nome
                  ? "border-ceu-escuro bg-ceu-escuro text-white"
                  : "border-linha bg-white text-tinta-suave"
              }`}
            >
              <Icone nome={nome} className="size-5" />
            </button>
          ))}
        </fieldset>
      </Secao>

      <Secao titulo="QUANDO">
        <label className="flex items-center gap-3 font-bold" htmlFor={`${ids}-hora`}>
          <span className="flex-1">Horário</span>
          <input
            id={`${ids}-hora`}
            type="time"
            className={`${campo} w-36`}
            value={t.time}
            required
            onChange={(e) => e.target.value && muda({ time: e.target.value })}
          />
        </label>
        <Contador
          rotulo="Timer"
          valor={t.durationMin ?? 0}
          min={0}
          max={180}
          passo={5}
          sufixo="min"
          aoMudar={(v) => muda({ durationMin: v || null })}
        />
        <fieldset>
          <legend className="mb-2 font-bold">Dias</legend>
          <div className="grid grid-cols-7 gap-1">
            {DIAS_CURTOS.map((d, i) => {
              const on = (t.days & (1 << i)) !== 0;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const dias = t.days ^ (1 << i);
                    if (dias) muda({ days: dias });
                  }}
                  className={`min-h-11 rounded-xl text-sm font-extrabold capitalize ${
                    on ? "bg-ceu-escuro text-white" : "bg-linha text-tinta-suave"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </fieldset>
      </Secao>

      <Secao titulo="RECOMPENSA">
        <Contador
          rotulo="Estrelas"
          valor={t.stars}
          min={1}
          max={50}
          aoMudar={(v) => muda({ stars: v })}
        />
        <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-depois`}>
          Depois vem… (Primeiro → Depois)
          <input
            id={`${ids}-depois`}
            className={campo}
            maxLength={40}
            value={t.thenText ?? ""}
            placeholder="Ex.: 30 min de videogame"
            onChange={(e) => muda({ thenText: e.target.value })}
          />
        </label>
        <Interruptor
          rotulo="Precisa do ok dos pais"
          ajuda="As estrelas entram quando um adulto aprovar."
          ligado={t.requiresApproval}
          aoMudar={(v) => muda({ requiresApproval: v })}
        />
      </Secao>

      <Secao titulo={`PASSO A PASSO · ${t.steps.length}`}>
        {t.steps.map((p, i) => (
          <div key={`passo-${i.toString()}`} className="flex gap-2">
            <span className="mt-3 grid size-7 shrink-0 place-items-center rounded-full bg-ceu-claro text-sm font-extrabold text-ceu-escuro">
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                aria-label={`Passo ${i + 1}`}
                className={campo}
                maxLength={80}
                value={p.text}
                placeholder="O que fazer"
                onChange={(e) =>
                  muda({
                    steps: t.steps.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)),
                  })
                }
              />
              <input
                aria-label={`Dica do passo ${i + 1}`}
                className={`${campo} h-10 text-sm`}
                maxLength={120}
                value={p.detail ?? ""}
                placeholder="Dica (opcional)"
                onChange={(e) =>
                  muda({
                    steps: t.steps.map((x, k) => (k === i ? { ...x, detail: e.target.value } : x)),
                  })
                }
              />
            </div>
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Subir passo"
                className="grid size-9 place-items-center text-tinta-suave"
                onClick={() => moverPasso(i, -1)}
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Descer passo"
                className="grid size-9 place-items-center text-tinta-suave"
                onClick={() => moverPasso(i, 1)}
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Tirar passo"
                className="grid size-9 place-items-center text-tinta-suave"
                onClick={() => muda({ steps: t.steps.filter((_, k) => k !== i) })}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        {t.steps.length < 12 && (
          <button
            type="button"
            className="bp bp-claro self-start"
            onClick={() => muda({ steps: [...t.steps, { text: "" }] })}
          >
            <Plus className="size-4" aria-hidden="true" /> Adicionar passo
          </button>
        )}
      </Secao>

      <Secao titulo="ANTES DE COMEÇAR">
        <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-separar`}>
          O que separar (separe com vírgula)
          <input
            id={`${ids}-separar`}
            className={campo}
            value={separar}
            placeholder="Ex.: Toalha, Pijama"
            onChange={(e) => setSeparar(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 font-bold" htmlFor={`${ids}-detalhe`}>
          Explicação curta (opcional)
          <input
            id={`${ids}-detalhe`}
            className={campo}
            maxLength={80}
            value={t.detail ?? ""}
            placeholder="Ex.: Matemática, página 42"
            onChange={(e) => muda({ detail: e.target.value })}
          />
        </label>
      </Secao>

      <Secao titulo="LEMBRETE">
        <Interruptor
          rotulo="Lembrar no horário"
          ligado={t.remind}
          aoMudar={(v) => muda({ remind: v })}
        />
        {t.id ? (
          <GravadorDeVoz taskId={t.id} temVoz={t.hasVoice} podeGravar={podeGravar} />
        ) : (
          <p className="text-sm font-semibold text-tinta-suave">
            Salve a tarefa para gravar a sua voz no lembrete.
          </p>
        )}
      </Secao>

      <Erro texto={erro} />
      <div className="flex gap-2">
        {t.id &&
          (apagando ? (
            <div className="cartao flex flex-1 flex-wrap items-center gap-2 p-3">
              <p className="flex-1 text-sm font-bold">Apagar “{t.title}”?</p>
              <button type="button" className="bp bp-claro" onClick={() => setApagando(false)}>
                Não
              </button>
              <button
                type="button"
                className="bp bp-perigo"
                disabled={pendente}
                onClick={() => {
                  const id = t.id;
                  if (id)
                    rodar(
                      () => apagarTarefaAction(id),
                      () => router.push(voltar),
                    );
                }}
              >
                Apagar
              </button>
            </div>
          ) : (
            <button type="button" className="bp bp-perigo" onClick={() => setApagando(true)}>
              <Trash2 className="size-4" aria-hidden="true" /> Apagar
            </button>
          ))}
        {!apagando && (
          <button type="button" className="bp bp-ceu flex-1" disabled={pendente} onClick={salvar}>
            {pendente ? "Salvando…" : "Salvar tarefa"}
          </button>
        )}
      </div>
    </div>
  );
}
