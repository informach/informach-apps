"use client";
import dynamic from "next/dynamic";
import type { PlayerProps } from "./player";

/** O player usa câmera, WebGL, voz e tela cheia: só existe no navegador. */
export const PlayerLoader = dynamic<PlayerProps>(
  () => import("./player").then((m) => m.PlayerScreen),
  {
    ssr: false,
    // o pacote do instrutor 3D e da câmera demora no celular: uma tela preta parecia travada
    loading: () => (
      <div className="player">
        <div className="overlay-msg static" role="status">
          <div>
            <h2>Preparando o treino…</h2>
          </div>
        </div>
      </div>
    ),
  },
);
