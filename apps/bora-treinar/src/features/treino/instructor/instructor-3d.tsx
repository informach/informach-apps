"use client";
import dynamic from "next/dynamic";
import type { InstructorProps } from "./instructor";

/** WebGL só existe no navegador: o instrutor nunca é renderizado no servidor. */
export const Instructor3D = dynamic<InstructorProps>(
  () => import("./instructor").then((m) => m.Instructor),
  { ssr: false },
);
