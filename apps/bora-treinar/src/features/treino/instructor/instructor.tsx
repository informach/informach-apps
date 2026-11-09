"use client";
import { useEffect, useRef } from "react";
import { exerciseById, type View } from "../catalog/catalog";
import { type InstructorMode, type InstructorQuality, InstructorScene } from "./instructor-scene";

export interface InstructorProps {
  exerciseId?: string;
  mode: InstructorMode;
  view?: View;
  followDepth?: number;
  paused?: boolean;
  /**
   * Padrão "alta". "baixa" tira antialias, sombras, pixel ratio alto e limita a ~30 fps
   * (veja `aparelhoFraco` em `instructor-3d.tsx`). O antialias segue o valor da
   * montagem; trocas depois ajustam o resto sem recriar a cena.
   */
  qualidade?: InstructorQuality;
  className?: string;
}

/** Instrutor 3D como componente React. Um único canvas WebGL por instância. */
export function Instructor({
  exerciseId,
  mode,
  view,
  followDepth,
  paused,
  qualidade,
  className,
}: InstructorProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<InstructorScene | null>(null);
  // a qualidade da montagem decide o antialias; mudanças depois vão por setQuality
  const qualidadeInicial = useRef(qualidade);

  useEffect(() => {
    if (!host.current) return;
    let s: InstructorScene;
    try {
      s = new InstructorScene(host.current, { qualidade: qualidadeInicial.current });
    } catch {
      // sem WebGL (TV antiga, navegador sem aceleração): o treino segue sem o boneco
      return;
    }
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  // Trocar de exercício reinicia a animação; o modo é reaplicado em seguida para
  // que a cena nova já comece no ritmo certo (cadência, isometria, seguir).
  useEffect(() => {
    if (exerciseId) {
      const ex = exerciseById(exerciseId);
      scene.current?.setExercise(
        ex.pose,
        ex.cadence,
        ex.highlight,
        view ?? ex.view,
        ex.equipment === "chão" ? undefined : ex.equipment,
      );
    }
    scene.current?.setMode(mode);
  }, [exerciseId, view, mode]);

  useEffect(() => scene.current?.setPaused(!!paused), [paused]);
  useEffect(() => scene.current?.setQuality(qualidade ?? "alta"), [qualidade]);
  useEffect(() => {
    if (followDepth !== undefined) scene.current?.setFollowDepth(followDepth);
  }, [followDepth]);

  return <div ref={host} className={className} />;
}
