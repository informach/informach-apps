"use client";
import dynamic from "next/dynamic";

/** Câmera e detector de pose só existem no navegador. */
export const CameraLoader = dynamic<{ codigo: string }>(
  () => import("./camera-celular").then((m) => m.CameraCelular),
  { ssr: false, loading: () => <main className="phone-cam centered">Conectando…</main> },
);
