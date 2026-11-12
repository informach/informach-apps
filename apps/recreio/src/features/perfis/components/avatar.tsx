import { cn } from "@informach/ui/lib/utils";
import { type Avatar, avatarConhecido, inicialDoApelido } from "../avatares";

/**
 * Avatar do perfil: um disco de cor com a inicial do apelido. Não há imagem
 * enviada pela pessoa nem arte licenciada; o conjunto é fixo.
 */
const CORES: Record<Avatar, string> = {
  padrao: "bg-painel-2 text-tinta ring-1 ring-linha-forte",
  sol: "bg-sol text-sol-texto",
  coral: "bg-coral text-fundo",
  mar: "bg-mar text-fundo",
  ceu: "bg-ceu text-fundo",
  lua: "bg-tinta text-fundo",
};

export function AvatarDoPerfil({
  avatar,
  apelido,
  tamanho = "md",
}: {
  avatar: string;
  apelido: string;
  tamanho?: "sm" | "md" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display leading-none font-extrabold",
        tamanho === "sm" && "size-8 text-sm",
        tamanho === "md" && "size-12 text-xl",
        tamanho === "lg" && "size-20 text-4xl",
        CORES[avatarConhecido(avatar)],
      )}
    >
      {inicialDoApelido(apelido)}
    </span>
  );
}
