import { getAppUrl } from "@informach/config/domains";
import { env } from "@/lib/env";
export const metadata = { title: "Convite" };
export default function Convite() {
  const environment =
    new URL(env.NEXT_PUBLIC_APP_URL).hostname === "localhost" ? "development" : "production";
  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-4 py-10 text-center"
    >
      <h1 className="font-display text-3xl font-extrabold">Peça um novo convite</h1>
      <p>
        Os convites da família agora são gerenciados na Minha conta. Quem já fazia parte continua
        com as permissões que tinha.
      </p>
      <a className="bp bp-ceu" href={getAppUrl("conta", environment)}>
        Abrir Minha conta
      </a>
    </main>
  );
}
