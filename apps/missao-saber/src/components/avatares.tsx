/**
 * Avatares do estudante.
 *
 * A coluna `missao_saber.profiles.avatar` já existia e era escolhida na
 * criação do perfil, mas nunca aparecia em nenhuma tela. Aqui ela vira
 * identidade visível: cabeçalho, troca de estudante, conclusão de missão
 * e área da família.
 *
 * A coluna é `text` sem CHECK no banco, então ampliar o conjunto exige
 * apenas estender `AVATARES` e o enum em features/learning/schemas.ts.
 */
export const AVATARES = [
  { id: "cometa", nome: "Cometa", fundo: "var(--ms-ceu)", tinta: "#FFFFFF" },
  { id: "folha", nome: "Folha", fundo: "var(--ms-verde)", tinta: "#FFFFFF" },
  { id: "estrela", nome: "Estrela", fundo: "var(--ms-sol)", tinta: "var(--ms-tinta)" },
  { id: "foguete", nome: "Foguete", fundo: "var(--ms-coral)", tinta: "#FFFFFF" },
  { id: "lua", nome: "Lua", fundo: "var(--ms-uva)", tinta: "#FFFFFF" },
  { id: "raio", nome: "Raio", fundo: "var(--ms-lima)", tinta: "var(--ms-tinta)" },
  { id: "onda", nome: "Onda", fundo: "var(--ms-ceu-fundo)", tinta: "#FFFFFF" },
  { id: "bussola", nome: "Bússola", fundo: "var(--ms-verde-fundo)", tinta: "#FFFFFF" },
] as const;

export type AvatarId = (typeof AVATARES)[number]["id"];

function Glifo({ id, cor }: { id: string; cor: string }) {
  const traco = {
    stroke: cor,
    strokeWidth: 3.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  switch (id) {
    case "folha":
      return (
        <g>
          <path d="M34 30 C34 44 26 50 17 50 C17 36 25 30 34 30 Z" fill={cor} />
          <path d="M31 33 L17 48" {...traco} fill="none" strokeWidth={2.4} />
        </g>
      );
    case "estrela":
      return (
        <path
          d="M24 14 L28.6 23.6 L39 25.2 L31.5 32.6 L33.3 43 L24 38 L14.7 43 L16.5 32.6 L9 25.2 L19.4 23.6 Z"
          fill={cor}
        />
      );
    case "foguete":
      return (
        <g>
          <path d="M24 10 C30 17 33 24 33 30 A9 9 0 0 1 15 30 C15 24 18 17 24 10 Z" fill={cor} />
          <circle cx="24" cy="25" r="3.6" fill="var(--ms-tinta)" opacity="0.35" />
          <path d="M17 33 L13 40 M31 33 L35 40" {...traco} fill="none" />
        </g>
      );
    case "lua":
      return <path d="M30 12 A14 14 0 1 0 30 36 A11 11 0 0 1 30 12 Z" fill={cor} />;
    case "raio":
      return <path d="M27 8 L14 26 L22 26 L20 40 L34 21 L26 21 Z" fill={cor} />;
    case "onda":
      return (
        <g fill="none" {...traco}>
          <path d="M8 20 Q14 13 20 20 T32 20 T44 20" />
          <path d="M8 30 Q14 23 20 30 T32 30 T44 30" />
        </g>
      );
    case "bussola":
      return (
        <g>
          <circle cx="24" cy="24" r="14" fill="none" stroke={cor} strokeWidth="3" />
          <path d="M30 18 L26 26 L18 30 L22 22 Z" fill={cor} />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="29" cy="19" r="8" fill={cor} />
          <path d="M22 25 L10 37 M25 29 L15 39 M18 22 L8 30" {...traco} fill="none" />
        </g>
      );
  }
}

const ESCALA = { pp: 32, p: 44, m: 60, g: 88 } as const;

export function Avatar({
  id,
  tamanho = "m",
  className = "",
}: {
  id: string;
  tamanho?: keyof typeof ESCALA;
  className?: string;
}) {
  const def = AVATARES.find((a) => a.id === id) ?? AVATARES[0];
  const px = ESCALA[tamanho];
  return (
    /* Decorativo de propósito: o apelido do estudante aparece sempre ao
       lado, e um rótulo aqui entraria no nome acessível do botão que
       envolve o avatar. */
    <svg
      viewBox="0 0 48 48"
      width={px}
      height={px}
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <rect width="48" height="48" rx="16" fill={def.fundo} />
      <Glifo id={def.id} cor={def.tinta} />
    </svg>
  );
}
