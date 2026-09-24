import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Agenda da Turma",
    short_name: "Agenda",
    description: "Organize tarefas, provas e recados dos seus filhos em um só lugar.",
    // A rotina, não a página de vendas. Quem instalou o app já decidiu: com
    // `start_url: "/"` o atalho da tela inicial abria a landing com preço e
    // FAQ. Sem sessão, o proxy leva a `/login` normalmente.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#006FFD",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["education", "productivity"],
    /*
     * Compartilhar do WhatsApp (ou de qualquer app) direto para a Agenda.
     *
     * O recado chega numa conversa; até aqui a família tinha de salvar a foto,
     * abrir o app, achar o arquivo e enviar. Com isto, a Agenda aparece na
     * folha de compartilhamento do sistema e recebe a foto ou o texto de uma
     * vez. O service worker intercepta o POST e guarda o conteúdo até a tela de
     * revisão abrir — nada é enviado para lugar nenhum sem a pessoa conferir.
     */
    share_target: {
      action: "/recados/compartilhar",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "arquivos",
            accept: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
          },
        ],
      },
    },
    icons: [
      { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
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
