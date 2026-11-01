"use client";
import dynamic from "next/dynamic";

/** O laboratório usa câmera, WebGL e o detector de pose: só existe no navegador. */
export const LaboratorioLoader = dynamic<{ exerciseId: string }>(
  () => import("./laboratorio").then((m) => m.Laboratorio),
  { ssr: false, loading: () => <div className="screen" /> },
);
