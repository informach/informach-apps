import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cozya",
    short_name: "Cozya",
    description: "Receitas rápidas, sem caos. Capture, organize e cozinhe direto do celular.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#FF7A3D",
    lang: "pt-BR",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
