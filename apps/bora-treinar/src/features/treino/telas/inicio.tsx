"use client";
import { CalendarCheck, Clock, Flame, Lock, Play, Repeat, Shuffle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TopNav } from "@/components/top-nav";
import { Cadeado, usePlanos } from "@/features/billing/planos";
import { CHAINS, exerciseById } from "../catalog/catalog";
import { estimateMinutes, type Workout } from "../catalog/workouts";
import type { ProgressMap, Suggestion } from "../engine/progression";
import { Instructor3D } from "../instructor/instructor-3d";
import { SugestoesDeNivel } from "./sugestoes";

export type WorkoutCard = Workout & { ref: string; locked: boolean };

export const workoutHref = (ref: string) => `/treino?ref=${encodeURIComponent(ref)}`;

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export interface SemanaDoPerfil {
  dias: number;
  meta: number;
  cumprida: boolean;
  /** seg..dom: treinou naquele dia */
  diasDaSemana: boolean[];
  /** semanas cumpridas seguidas */
  seguidas: number;
  reps: number;
  minutos: number;
}

/**
 * Início do perfil: o treino do dia (escolhido pelo recomendador, com o porquê), a semana contra
 * a meta, o que está pronto para subir e os níveis. A lista de treinos mora em Treinos.
 */
export function HomeScreen({
  profile,
  hoje,
  semana,
  sugestoes,
  progress,
  paid,
  desafio,
}: {
  profile: { id: string; name: string; color: string };
  hoje: { card: WorkoutCard; motivo: string } | null;
  semana: SemanaDoPerfil;
  sugestoes: Suggestion[];
  progress: ProgressMap;
  paid: boolean;
  /** cartão do desafio da semana, quando houver (montado no servidor) */
  desafio?: ReactNode;
}) {
  const firstName = profile.name.split(" ")[0];
  const faltam = Math.max(0, semana.meta - semana.dias);

  return (
    <div className="screen">
      <TopNav profile={profile} />
      <main className="scroll" id="conteudo">
        <section className="hero">
          <div className="hero-main">
            <Instructor3D
              className="hero-figure"
              exerciseId="agachamento"
              mode="cadence"
              view="three4"
            />
            <span className="eyebrow">Hoje é dia de · {firstName}</span>
            {hoje && (
              <>
                <h1>{hoje.card.name}</h1>
                <p className="hero-motivo">{hoje.motivo}</p>
                <div className="meta">
                  <span>{hoje.card.level}</span>
                  <span>~{estimateMinutes(hoje.card)} min</span>
                </div>
                <div className="hero-acoes">
                  <Link href={workoutHref(hoje.card.ref)} className="btn big" data-autofocus>
                    <Play size={20} fill="currentColor" /> Começar
                  </Link>
                  <Link href="/treinos" className="btn big ghost-on-accent">
                    <Shuffle size={18} /> Outro
                  </Link>
                </div>
              </>
            )}
          </div>
          <div className="stat-stack">
            <div className="stat semana-card">
              <span className="label">
                <CalendarCheck size={16} /> Sua semana
              </span>
              <span className="value num">
                {semana.dias}
                <small> de {semana.meta} dias</small>
              </span>
              <div
                className="semana-dias"
                role="img"
                aria-label={`${semana.dias} de ${semana.meta} dias`}
              >
                {DIAS.map((d, i) => (
                  <span key={d} className={semana.diasDaSemana[i] ? "on" : ""}>
                    {d}
                  </span>
                ))}
              </div>
              <span className="muted small">
                {semana.cumprida
                  ? "Meta da semana cumprida!"
                  : `Falta${faltam > 1 ? "m" : ""} ${faltam} dia${faltam > 1 ? "s" : ""}`}
              </span>
            </div>
            <div className="stat">
              <span className="label">
                <Flame size={16} /> Semanas cumpridas
              </span>
              <span className="value num">
                {semana.seguidas}
                <small>{semana.seguidas === 1 ? " seguida" : " seguidas"}</small>
              </span>
            </div>
            <div className="stat">
              <span className="label">
                <Repeat size={16} /> Repetições na semana
              </span>
              <span className="value num">{semana.reps}</span>
            </div>
            <div className="stat">
              <span className="label">
                <Clock size={16} /> Minutos na semana
              </span>
              <span className="value num">{semana.minutos}</span>
            </div>
          </div>
        </section>

        {!paid && (
          <Cadeado motivo="geral" className="card upsell">
            <strong>Você está no plano gratuito.</strong>
            <span className="muted">
              Teste ou assine para liberar todos os treinos, a câmera contando e os níveis.
            </span>
          </Cadeado>
        )}

        {sugestoes.length > 0 && (
          <>
            <div className="section-title">
              <h2>Pronta para subir</h2>
              <span className="muted">aceite aqui, vale no próximo treino</span>
            </div>
            <SugestoesDeNivel profileId={profile.id} sugestoes={sugestoes} permitido={paid} />
          </>
        )}

        {desafio}

        <div className="section-title">
          <h2>Seus níveis</h2>
          <span className="muted">avançam quando você bate as metas</span>
        </div>
        <div className="levels">
          {CHAINS.map((c) => {
            const st = progress[c.id] ?? { level: 0, bonus: 0 };
            const exId = c.levels[Math.min(st.level, c.levels.length - 1)] ?? c.levels[0] ?? "";
            const ex = exerciseById(exId);
            const unit = ex.rule.kind === "hold" ? "s" : " rep.";
            return (
              <Link key={c.id} href={`/exercicios/${ex.id}`} className="card level-card">
                <span className="muted">{c.name}</span>
                <h3 className="level-name">{ex.name}</h3>
                {st.bonus > 0 && (
                  <span className="muted">
                    {" "}
                    +{st.bonus}
                    {unit} na meta
                  </span>
                )}
                <div className="track">
                  {c.levels.map((l, i) => (
                    <span key={l} className={i <= st.level ? "on" : ""} />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export function WorkoutTile({ w }: { w: WorkoutCard }) {
  const abrirPlanos = usePlanos();
  return (
    <Link
      href={workoutHref(w.ref)}
      className="card workout-card"
      onClick={(e) => {
        // treino da assinatura: abre os planos aqui mesmo, em vez de levar a Conta
        if (!w.locked) return;
        e.preventDefault();
        abrirPlanos("treino");
      }}
    >
      <span className="muted">{w.focus}</span>
      <h3>{w.name}</h3>
      <p className="muted">{w.subtitle}</p>
      <span className="tags">
        <span className="chip">{w.level}</span>
        <span className="chip">~{estimateMinutes(w)} min</span>
        {w.locked && (
          <span className="chip">
            <Lock size={14} /> Assinatura
          </span>
        )}
      </span>
    </Link>
  );
}
