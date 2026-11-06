"use client";
import { ArrowLeft, Camera, Check, Hand, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { voltar } from "@/lib/voltar";
import { unlockAudio } from "../engine/voice";

export const MIN_JUNTO = 2;
export const MAX_JUNTO = 4;

/**
 * Treinar junto (o extra, não o centro): 2 a 4 perfis no mesmo treino de séries, em rodízio. Cada
 * um faz a sua série com o seu nível; no fim, cada perfil ganha o próprio treino salvo.
 */
export function JuntoScreen({
  perfis,
  treinos,
  cameraPermitida,
}: {
  perfis: { id: string; name: string; color: string }[];
  treinos: { ref: string; name: string; focus: string; minutos: number }[];
  cameraPermitida: boolean;
}) {
  const router = useRouter();
  const [escolhidos, setEscolhidos] = useState<string[]>(perfis.slice(0, 2).map((p) => p.id));
  const [treino, setTreino] = useState(treinos[0]?.ref ?? "");
  const [modo, setModo] = useState<"manual" | "camera">("manual");
  const alternar = (id: string) =>
    setEscolhidos((atual) =>
      atual.includes(id)
        ? atual.filter((x) => x !== id)
        : atual.length < MAX_JUNTO
          ? [...atual, id]
          : atual,
    );
  const pode = escolhidos.length >= MIN_JUNTO && !!treino;
  const comecar = () => {
    unlockAudio();
    const q = new URLSearchParams({ ref: treino, modo, junto: escolhidos.join(",") });
    router.push(`/treinar?${q}`);
  };
  return (
    <div className="screen">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => voltar(router, "/perfis")}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="spacer" />
      </header>
      <main className="scroll narrow" id="conteudo">
        <h1>Treinar junto</h1>
        <p className="muted lead">
          Cada um na sua vez, com o seu nível. O treino fica salvo no perfil de cada pessoa.
        </p>

        <fieldset className="escolhas linha junto-perfis">
          <legend>Quem vai treinar? (de 2 a 4)</legend>
          {perfis.map((p) => (
            <label key={p.id} className="escolha curta">
              <input
                type="checkbox"
                className="sr-only"
                checked={escolhidos.includes(p.id)}
                onChange={() => alternar(p.id)}
              />
              <Avatar profile={p} size="3rem" />
              <strong>{p.name}</strong>
              {escolhidos.includes(p.id) && <Check size={16} aria-hidden />}
            </label>
          ))}
        </fieldset>

        <fieldset className="escolhas">
          <legend>Qual treino?</legend>
          {treinos.map((t) => (
            <label key={t.ref} className="escolha">
              <input
                type="radio"
                name="treino"
                className="sr-only"
                checked={treino === t.ref}
                onChange={() => setTreino(t.ref)}
              />
              <strong>{t.name}</strong>
              <span className="muted">
                {t.focus} · ~{t.minutos * escolhidos.length || t.minutos} min juntos
              </span>
            </label>
          ))}
          <p className="muted small">
            Só treinos de séries: AMRAP, EMOM e intervalos têm um relógio só.
          </p>
        </fieldset>

        <fieldset className="escolhas linha">
          <legend>Como contar?</legend>
          <label className="escolha curta">
            <input
              type="radio"
              name="modo"
              className="sr-only"
              checked={modo === "manual"}
              onChange={() => setModo("manual")}
            />
            <Hand size={20} aria-hidden />
            <strong>À mão ou pela voz</strong>
          </label>
          {cameraPermitida && (
            <label className="escolha curta">
              <input
                type="radio"
                name="modo"
                className="sr-only"
                checked={modo === "camera"}
                onChange={() => setModo("camera")}
              />
              <Camera size={20} aria-hidden />
              <strong>Câmera (quem está na vez)</strong>
            </label>
          )}
        </fieldset>

        <button
          type="button"
          className="btn primary big"
          disabled={!pode}
          onClick={comecar}
          data-autofocus
        >
          <Play size={20} fill="currentColor" /> Começar juntos
        </button>
      </main>
    </div>
  );
}
