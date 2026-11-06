import type { FalhaVoz } from "./engine/voz";

export type Navegador =
  | "ios"
  | "android-chrome"
  | "samsung"
  | "firefox"
  | "desktop-chrome"
  | "safari-mac"
  | "outro";

/** Qual navegador é, só para dizer onde fica o ajuste certo (nunca para decidir o que funciona). */
export function navegadorDe(ua: string): Navegador {
  const u = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(u) || (u.includes("macintosh") && u.includes("mobile"))) return "ios";
  if (u.includes("firefox") || u.includes("fxios")) return "firefox";
  if (u.includes("samsungbrowser")) return "samsung";
  if (u.includes("android")) return "android-chrome";
  if (u.includes("chrome") || u.includes("edg/")) return "desktop-chrome";
  if (u.includes("safari")) return "safari-mac";
  return "outro";
}

const LIBERAR: Record<Navegador, string> = {
  ios: "No iPhone: abra Ajustes › Safari › Microfone e escolha Permitir (ou toque em aA na barra do endereço › Ajustes do Site › Microfone › Permitir). Depois volte e toque em Tentar de novo.",
  "android-chrome":
    "No Chrome do Android: toque no cadeado ao lado do endereço › Permissões › Microfone › Permitir. Se não aparecer, abra Configurações do celular › Apps › Chrome › Permissões › Microfone. Depois toque em Tentar de novo.",
  samsung:
    "No Samsung Internet: toque no cadeado ao lado do endereço › Permissões do site › Microfone › Permitir. Depois toque em Tentar de novo.",
  firefox:
    "Este navegador não reconhece voz. Abra o Bora Treinar no Chrome ou no Safari para contar pela voz.",
  "desktop-chrome":
    "No computador: clique no ícone ao lado do endereço › Microfone › Permitir. Depois clique em Tentar de novo.",
  "safari-mac":
    "No Safari: menu Safari › Ajustes › Sites › Microfone › Permitir para este site. Depois clique em Tentar de novo.",
  outro:
    "Libere o microfone para este site nas permissões do navegador e toque em Tentar de novo. Se não der, use o Chrome ou o Safari.",
};

/** O que dizer quando a voz não liga: o título e o caminho para resolver, para este navegador. */
export function ajudaDaVoz(falha: FalhaVoz, nav: Navegador): { titulo: string; texto: string } {
  if (falha === "indisponivel")
    return {
      titulo: "Este navegador não reconhece voz",
      texto:
        nav === "ios"
          ? "Atualize o iPhone ou use o Safari para contar pela voz."
          : "Abra o Bora Treinar no Chrome ou no Safari para contar pela voz. A contagem pela câmera e pelo toque continuam aqui.",
    };
  if (falha === "servico")
    return {
      titulo: "O reconhecimento de fala está desligado",
      texto:
        nav === "ios"
          ? "No iPhone, a contagem pela voz usa o Ditado. Abra Ajustes › Geral › Teclado e ligue Ativar Ditado; depois toque em Tentar de novo."
          : "O navegador desligou o reconhecimento de fala para este site. Confira as permissões do site e toque em Tentar de novo.",
    };
  if (falha === "sem-rede")
    return {
      titulo: "A contagem pela voz precisa de internet",
      texto:
        "O reconhecimento de fala do navegador funciona pela internet. Quando a conexão voltar, toque em Tentar de novo; enquanto isso, conte pelo toque ou pela câmera.",
    };
  if (falha === "sem-microfone")
    return {
      titulo: "Nenhum microfone disponível",
      texto:
        "O aparelho não achou um microfone livre. Feche outros apps que estejam usando o microfone (chamada, gravador) e toque em Tentar de novo.",
    };
  return { titulo: "Microfone bloqueado", texto: LIBERAR[nav] };
}

const CAMERA: Record<Navegador, string> = {
  ios: "No iPhone: abra Ajustes › Safari › Câmera e escolha Permitir (ou toque em aA na barra do endereço › Ajustes do Site › Câmera › Permitir). Depois toque em Tentar de novo.",
  "android-chrome":
    "No Chrome do Android: toque no cadeado ao lado do endereço › Permissões › Câmera › Permitir. Depois toque em Tentar de novo.",
  samsung:
    "No Samsung Internet: toque no cadeado ao lado do endereço › Permissões do site › Câmera › Permitir. Depois toque em Tentar de novo.",
  firefox:
    "No Firefox: toque no cadeado ao lado do endereço e libere a câmera para este site. Depois toque em Tentar de novo.",
  "desktop-chrome":
    "No computador: clique no ícone ao lado do endereço › Câmera › Permitir. Depois clique em Tentar de novo.",
  "safari-mac": "No Safari: menu Safari › Ajustes › Sites › Câmera › Permitir para este site.",
  outro: "Libere a câmera para este site nas permissões do navegador e toque em Tentar de novo.",
};

/** Como liberar a câmera neste navegador, quando ela foi negada. */
export const ajudaDaCamera = (nav: Navegador) => CAMERA[nav];
