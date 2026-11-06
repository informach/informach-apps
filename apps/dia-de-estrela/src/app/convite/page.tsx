import Link from "next/link";
import { Lumi } from "@/components/desenhos";
import { AceitarConvite } from "@/features/responsavel/components/aceitar";
import { invitationPreview } from "@/features/responsavel/repository";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Convite" };

export default async function Convite({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const convite = await invitationPreview(token);
  const user = await getCurrentUser();
  const proximo = `/convite?token=${encodeURIComponent(token)}`;
  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 py-10 text-center"
    >
      <Lumi tamanho={110} />
      {!convite ? (
        <>
          <h1 className="font-display text-3xl font-extrabold">Este convite não vale mais</h1>
          <p className="font-semibold text-tinta-suave">
            Peça um novo convite para quem te chamou.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl leading-tight font-extrabold">
            {convite.ownerName ? `${convite.ownerName} chamou você` : "Você foi chamado"} para
            cuidar da rotina das crianças
          </h1>
          <p className="font-semibold text-tinta-suave">
            Como segundo responsável, você acompanha o dia, recebe os alertas e aprova tarefas. O
            convite é para <strong>{convite.email}</strong>.
          </p>
          {user?.emailVerified ? (
            <AceitarConvite token={token} />
          ) : (
            <Link href={`/entrar?next=${encodeURIComponent(proximo)}`} className="b3 b3-ceu w-full">
              Entrar ou criar conta
            </Link>
          )}
        </>
      )}
    </main>
  );
}
