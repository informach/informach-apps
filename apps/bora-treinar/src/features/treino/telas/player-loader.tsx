"use client";
import dynamic from "next/dynamic";
import type { PlayerProps } from "./player";

/** O player usa câmera, WebGL, voz e tela cheia: só existe no navegador. */
export const PlayerLoader = dynamic<PlayerProps>(
  () => import("./player").then((m) => m.PlayerScreen),
  {
    ssr: false,
    loading: () => <div className="player" />,
  },
);
