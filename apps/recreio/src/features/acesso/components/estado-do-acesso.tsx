import { INFORMACH_CONTACT } from "@informach/config/contact";
import { CircleCheck, CirclePause } from "lucide-react";
import type { TextoDoAcesso } from "../texto";

/**
 * O direito de jogar, como a pessoa lê. Recebe o texto pronto; a decisão é do
 * servidor (`avaliarAcesso`). Quando o acesso está parado, mostra por onde
 * falar com a equipe: o direct do Instagram, nunca um e-mail.
 */
export function EstadoDoAcesso({
  texto,
  nivel = "h2",
  id,
}: {
  texto: TextoDoAcesso;
  nivel?: "h1" | "h2";
  id?: string;
}) {
  const Titulo = nivel;
  const Icone = texto.tom === "ok" ? CircleCheck : CirclePause;
  return (
    <div className="flex gap-4">
      <Icone
        className={
          texto.tom === "ok" ? "mt-1 size-6 shrink-0 text-mar" : "mt-1 size-6 shrink-0 text-sol"
        }
        aria-hidden="true"
      />
      <div>
        <Titulo
          id={id}
          className={
            nivel === "h1"
              ? "font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl"
              : "font-display text-xl font-bold"
          }
        >
          {texto.titulo}
        </Titulo>
        <p className="mt-2 max-w-xl leading-relaxed text-tinta-suave">{texto.texto}</p>
        {texto.tom === "parado" && (
          <p className="mt-3 text-sm text-tinta-suave">
            Dúvidas? Mande uma mensagem no direct do Instagram, em{" "}
            <a
              href={INFORMACH_CONTACT.directMessageUrl}
              className="font-bold text-ceu underline underline-offset-4"
            >
              @{INFORMACH_CONTACT.instagramHandle}
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
