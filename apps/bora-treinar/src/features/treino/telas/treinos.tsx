"use client";
import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TopNav } from "@/components/top-nav";
import { Cadeado } from "@/features/billing/planos";
import { type WorkoutCard, WorkoutTile } from "./inicio";

export type CartaoDeTreino = WorkoutCard & { minutos: number; semPulo: boolean };

const TEMPOS = [
  { id: "todos", rotulo: "Qualquer tempo", cabe: () => true },
  { id: "10", rotulo: "Até 10 min", cabe: (m: number) => m <= 12 },
  { id: "20", rotulo: "Até 20 min", cabe: (m: number) => m <= 22 },
  { id: "30", rotulo: "Mais longos", cabe: (m: number) => m > 22 },
] as const;

/**
 * Treinos: os prontos e os montados pela família, num lugar só (antes "Meus treinos" não tinha
 * entrada na navegação). Filtros por tempo, foco e "sem pulo" (para apartamento e para quem está
 * voltando a treinar).
 */
export function TreinosScreen({
  profile,
  treinos,
  podeMontar,
  maxMeus,
}: {
  profile: { name: string; color: string };
  treinos: CartaoDeTreino[];
  podeMontar: boolean;
  maxMeus: number;
}) {
  const [tempo, setTempo] = useState<(typeof TEMPOS)[number]["id"]>("todos");
  const [foco, setFoco] = useState<string | null>(null);
  const [semPulo, setSemPulo] = useState(false);
  const focos = [...new Set(treinos.map((t) => t.focus))];
  const filtro = TEMPOS.find((t) => t.id === tempo) ?? TEMPOS[0];
  const passa = (t: CartaoDeTreino) =>
    filtro.cabe(t.minutos) && (!foco || t.focus === foco) && (!semPulo || t.semPulo);
  const meus = treinos.filter((t) => t.ref.startsWith("meu:"));
  const prontos = treinos.filter((t) => t.ref.startsWith("catalogo:")).filter(passa);

  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <div className="section-title first">
          <h2>Treinos</h2>
          <span className="muted">{prontos.length} prontos</span>
        </div>
        <fieldset className="filtros">
          <legend className="sr-only">Filtros</legend>
          {TEMPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={tempo === t.id}
              onClick={() => setTempo(t.id)}
            >
              {t.rotulo}
            </button>
          ))}
          <span className="filtros-sep" aria-hidden />
          {focos.map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={foco === f}
              onClick={() => setFoco(foco === f ? null : f)}
            >
              {f}
            </button>
          ))}
          <span className="filtros-sep" aria-hidden />
          <button
            type="button"
            className="chip"
            aria-pressed={semPulo}
            onClick={() => setSemPulo(!semPulo)}
          >
            Sem pulo
          </button>
        </fieldset>
        {prontos.length ? (
          <div className="grid">
            {prontos.map((w) => (
              <WorkoutTile key={w.ref} w={w} />
            ))}
          </div>
        ) : (
          <div className="card empty">Nenhum treino com esses filtros.</div>
        )}

        <div className="section-title" id="meus">
          <h2>Meus treinos</h2>
          {podeMontar && meus.length < maxMeus && (
            <Link href="/meus-treinos/novo" className="chip">
              <Plus size={16} /> Montar treino
            </Link>
          )}
        </div>
        {!podeMontar ? (
          <Cadeado motivo="editor" className="card upsell">
            <strong>
              <Lock size={16} /> Monte treinos do seu jeito com a assinatura.
            </strong>
            <span className="muted">
              Combine séries, Tabata, EMOM e AMRAP com os exercícios do catálogo ou com o nível de
              cada pessoa nas trilhas.
            </span>
          </Cadeado>
        ) : meus.length ? (
          <div className="grid">
            {meus.map((w) => (
              <WorkoutTile key={w.ref} w={w} />
            ))}
          </div>
        ) : (
          <Link href="/meus-treinos/novo" className="card empty">
            Monte um treino do seu jeito, com séries, Tabata, EMOM ou AMRAP.
          </Link>
        )}
      </main>
    </div>
  );
}
