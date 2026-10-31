"use client";
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CHAINS, exerciseById } from "@/features/treino/catalog/catalog";
import { type Block, estimateMinutes } from "@/features/treino/catalog/workouts";
import { describeBlock } from "@/features/treino/telas/treino";
import { useServerAction } from "@/lib/use-server-action";
import { deleteCustomWorkoutAction, saveCustomWorkoutAction } from "./actions";
import { type CustomWorkoutInput, customWorkoutSchema, LEVELS, MAX_MINUTES } from "./schema";

const TIPOS: { type: Block["type"]; nome: string; ajuda: string }[] = [
  { type: "sets", nome: "Séries", ajuda: "Um exercício, várias séries com descanso" },
  {
    type: "interval",
    nome: "Intervalo",
    ajuda: "Tempo de esforço e pausa, em rodadas (Tabata, HIIT)",
  },
  { type: "emom", nome: "EMOM", ajuda: "A cada minuto, as repetições e descanso no resto" },
  { type: "amrap", nome: "AMRAP", ajuda: "Máximo de voltas no circuito dentro do tempo" },
];

function novoBloco(type: Block["type"]): Block {
  switch (type) {
    case "sets":
      return { type, slot: "agachamento", sets: 3, target: 10, rest: 45 };
    case "interval":
      return { type, label: "Tabata", slots: ["polichinelo"], work: 20, rest: 10, rounds: 8 };
    case "emom":
      return { type, label: "EMOM", slots: [{ slot: "agachamento", reps: 10 }], minutes: 5 };
    case "amrap":
      return { type, label: "AMRAP", slots: [{ slot: "polichinelo", reps: 15 }], minutes: 6 };
  }
}

/** Opções de exercício: o nível atual de cada trilha e cada exercício do catálogo. */
function SlotSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <select
      className="field"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <optgroup label="Nível atual de quem treina">
        {CHAINS.map((c) => (
          <option key={c.id} value={`trilha:${c.id}`}>
            Trilha {c.name}
          </option>
        ))}
      </optgroup>
      {CHAINS.map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.levels.map((id) => (
            <option key={id} value={id}>
              {exerciseById(id).name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function Numero({
  label,
  value,
  onChange,
  min,
  max,
  sufixo,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  sufixo?: string;
}) {
  return (
    <label className="num-field">
      <span className="muted">{label}</span>
      <span className="num-input">
        <input
          className="field"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        />
        {sufixo && <span className="muted">{sufixo}</span>}
      </span>
    </label>
  );
}

function EditorBloco({ bloco, mudar }: { bloco: Block; mudar: (b: Block) => void }) {
  if (bloco.type === "sets")
    return (
      <div className="block-fields">
        <SlotSelect
          label="Exercício"
          value={bloco.slot}
          onChange={(slot) => mudar({ ...bloco, slot })}
        />
        <Numero
          label="Séries"
          min={1}
          max={10}
          value={bloco.sets}
          onChange={(sets) => mudar({ ...bloco, sets })}
        />
        <Numero
          label="Meta"
          min={1}
          max={300}
          value={bloco.target}
          sufixo="rep. ou s"
          onChange={(target) => mudar({ ...bloco, target })}
        />
        <Numero
          label="Descanso"
          min={0}
          max={300}
          value={bloco.rest}
          sufixo="s"
          onChange={(rest) => mudar({ ...bloco, rest })}
        />
      </div>
    );
  if (bloco.type === "interval")
    return (
      <div className="block-fields">
        <input
          className="field"
          aria-label="Nome do bloco"
          maxLength={20}
          value={bloco.label}
          onChange={(e) => mudar({ ...bloco, label: e.target.value })}
        />
        {bloco.slots.map((slot, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: itens editáveis sem identidade própria; a posição é a identidade
          <span className="slot-row" key={`${i}-${slot}`}>
            <SlotSelect
              label={`Exercício ${i + 1}`}
              value={slot}
              onChange={(v) =>
                mudar({ ...bloco, slots: bloco.slots.map((s, j) => (j === i ? v : s)) })
              }
            />
            {bloco.slots.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Tirar exercício"
                onClick={() => mudar({ ...bloco, slots: bloco.slots.filter((_, j) => j !== i) })}
              >
                <Trash2 size={16} />
              </button>
            )}
          </span>
        ))}
        {bloco.slots.length < 6 && (
          <button
            type="button"
            className="chip"
            onClick={() => mudar({ ...bloco, slots: [...bloco.slots, "agachamento"] })}
          >
            <Plus size={14} /> Exercício
          </button>
        )}
        <Numero
          label="Esforço"
          min={5}
          max={180}
          value={bloco.work}
          sufixo="s"
          onChange={(work) => mudar({ ...bloco, work })}
        />
        <Numero
          label="Pausa"
          min={0}
          max={180}
          value={bloco.rest}
          sufixo="s"
          onChange={(rest) => mudar({ ...bloco, rest })}
        />
        <Numero
          label="Rodadas"
          min={1}
          max={30}
          value={bloco.rounds}
          onChange={(rounds) => mudar({ ...bloco, rounds })}
        />
      </div>
    );
  const limite = bloco.type === "emom" ? 4 : 6;
  return (
    <div className="block-fields">
      <input
        className="field"
        aria-label="Nome do bloco"
        maxLength={20}
        value={bloco.label}
        onChange={(e) => mudar({ ...bloco, label: e.target.value })}
      />
      {bloco.slots.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: itens editáveis sem identidade própria; a posição é a identidade
        <span className="slot-row" key={`${i}-${item.slot}`}>
          <SlotSelect
            label={`Exercício ${i + 1}`}
            value={item.slot}
            onChange={(slot) =>
              mudar({ ...bloco, slots: bloco.slots.map((s, j) => (j === i ? { ...s, slot } : s)) })
            }
          />
          <Numero
            label="Repetições"
            min={1}
            max={100}
            value={item.reps}
            onChange={(reps) =>
              mudar({ ...bloco, slots: bloco.slots.map((s, j) => (j === i ? { ...s, reps } : s)) })
            }
          />
          {bloco.slots.length > 1 && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Tirar exercício"
              onClick={() => mudar({ ...bloco, slots: bloco.slots.filter((_, j) => j !== i) })}
            >
              <Trash2 size={16} />
            </button>
          )}
        </span>
      ))}
      {bloco.slots.length < limite && (
        <button
          type="button"
          className="chip"
          onClick={() =>
            mudar({ ...bloco, slots: [...bloco.slots, { slot: "agachamento", reps: 10 }] })
          }
        >
          <Plus size={14} /> Exercício
        </button>
      )}
      <Numero
        label="Duração"
        min={1}
        max={30}
        value={bloco.minutes}
        sufixo="min"
        onChange={(minutes) => mudar({ ...bloco, minutes })}
      />
    </div>
  );
}

export function WorkoutEditor({ id, initial }: { id?: string; initial?: CustomWorkoutInput }) {
  const router = useRouter();
  const [form, setForm] = useState<CustomWorkoutInput>(
    initial ?? {
      name: "",
      subtitle: "",
      level: "Iniciante",
      focus: "Força",
      blocks: [novoBloco("sets")],
    },
  );
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  const validacao = useMemo(() => customWorkoutSchema.safeParse(form), [form]);
  const minutos = estimateMinutes({ id: "previa", ...form });
  const mudarBloco = (i: number, b: Block) =>
    setForm({ ...form, blocks: form.blocks.map((x, j) => (j === i ? b : x)) });
  const mover = (i: number, delta: number) => {
    const blocks = [...form.blocks];
    const [b] = blocks.splice(i, 1);
    if (!b) return;
    blocks.splice(i + delta, 0, b);
    setForm({ ...form, blocks });
  };

  const salvar = () =>
    start(async () => {
      const result = await saveCustomWorkoutAction(form, id);
      if (!result.ok) return setMessage(result.error);
      router.push(`/treino?ref=${encodeURIComponent(`meu:${result.data.id}`)}`);
    });
  const apagar = () =>
    start(async () => {
      if (
        !id ||
        !window.confirm("Apagar este treino? O histórico de quem já fez continua guardado.")
      )
        return;
      const result = await deleteCustomWorkoutAction(id);
      if (!result.ok) return setMessage(result.error);
      router.push("/meus-treinos");
    });

  return (
    <div className="screen">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => router.back()}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="page-title">{id ? "Editar treino" : "Montar treino"}</h1>
      </header>
      <main className="scroll narrow" id="conteudo">
        <div className="card form-grid">
          <label>
            <span className="muted">Nome</span>
            <input
              className="field"
              maxLength={40}
              value={form.name}
              placeholder="Treino da manhã"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-autofocus
            />
          </label>
          <label>
            <span className="muted">Descrição curta</span>
            <input
              className="field"
              maxLength={80}
              value={form.subtitle}
              placeholder="Rápido antes da escola"
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </label>
          <label>
            <span className="muted">Nível</span>
            <select
              className="field"
              value={form.level}
              onChange={(e) =>
                setForm({ ...form, level: e.target.value as CustomWorkoutInput["level"] })
              }
            >
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Foco</span>
            <input
              className="field"
              maxLength={24}
              value={form.focus}
              onChange={(e) => setForm({ ...form, focus: e.target.value })}
            />
          </label>
        </div>

        <div className="section-title">
          <h2>Blocos</h2>
          <span className={minutos > MAX_MINUTES ? "warn" : "muted"}>~{minutos} min</span>
        </div>
        <div className="stack">
          {form.blocks.map((bloco, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: itens editáveis sem identidade própria; a posição é a identidade
            <div className="card block-editor" key={`${i}-${bloco.type}`}>
              <div className="block-editor-head">
                <span className="idx">{i + 1}</span>
                <select
                  className="field compact"
                  aria-label="Tipo do bloco"
                  value={bloco.type}
                  onChange={(e) => mudarBloco(i, novoBloco(e.target.value as Block["type"]))}
                >
                  {TIPOS.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.nome}
                    </option>
                  ))}
                </select>
                <span className="muted grow">
                  {TIPOS.find((t) => t.type === bloco.type)?.ajuda}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Subir bloco"
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Descer bloco"
                  disabled={i === form.blocks.length - 1}
                  onClick={() => mover(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Apagar bloco"
                  disabled={form.blocks.length === 1}
                  onClick={() =>
                    setForm({ ...form, blocks: form.blocks.filter((_, j) => j !== i) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <EditorBloco bloco={bloco} mudar={(b) => mudarBloco(i, b)} />
              <p className="muted small">
                {describeBlock(bloco, {}).name} · {describeBlock(bloco, {}).detail}
              </p>
            </div>
          ))}
        </div>
        {form.blocks.length < 12 && (
          <div className="row spaced">
            {TIPOS.map((t) => (
              <button
                type="button"
                key={t.type}
                className="chip"
                onClick={() => setForm({ ...form, blocks: [...form.blocks, novoBloco(t.type)] })}
              >
                <Plus size={14} /> {t.nome}
              </button>
            ))}
          </div>
        )}

        <div className="row spaced">
          <button
            type="button"
            className="btn primary big"
            disabled={pending || !validacao.success}
            onClick={salvar}
          >
            Salvar treino
          </button>
          {id && (
            <button type="button" className="btn ghost" disabled={pending} onClick={apagar}>
              <Trash2 size={18} /> Apagar
            </button>
          )}
        </div>
        <p role="status" className="form-message">
          {message || (!validacao.success && form.name ? validacao.error.issues[0]?.message : "")}
        </p>
      </main>
    </div>
  );
}
