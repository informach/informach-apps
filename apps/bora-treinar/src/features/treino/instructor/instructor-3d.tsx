"use client";
import dynamic from "next/dynamic";
import type { InstructorProps } from "./instructor";

/** WebGL só existe no navegador: o instrutor nunca é renderizado no servidor. */
export const Instructor3D = dynamic<InstructorProps>(
  () => import("./instructor").then((m) => m.Instructor),
  { ssr: false },
);

/**
 * Aparelho fraco para o instrutor em "alta": poucos núcleos (≤ 4) ou pouca memória
 * (≤ 3 GB, quando o navegador informa). Serve para escolher `qualidade` sem carregar
 * three.js (a cena expõe a mesma função em `InstructorScene.aparelhoFraco`).
 */
export function aparelhoFraco(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency;
  if (cores > 0 && cores <= 4) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === "number" && memory <= 3;
}
