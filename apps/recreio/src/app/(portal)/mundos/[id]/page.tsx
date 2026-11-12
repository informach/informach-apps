import Link from "next/link";
import { notFound } from "next/navigation";
import { GerarConvite } from "@/features/mundos/components/gerar-convite";
import { detalheDoMundo } from "@/features/mundos/service";
import { avisoDoMembro, rotuloDoPapel } from "@/features/mundos/texto";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { paginaDoPortal } from "@/features/sessao/ator";

export const metadata = { title: "Mundo" };

/**
 * Um mundo, para quem é membro ativo dele. Para qualquer outra pessoa a
 * página é a mesma de um mundo que não existe.
 */
export default async function Mundo({ params }: { params: Promise<{ id: string }> }) {
  const { ator } = await paginaDoPortal();
  const mundo = await detalheDoMundo(ator.perfil.id, (await params).id);
  if (!mundo) notFound();
  return (
    <>
      <p className="text-sm font-semibold text-tinta-suave">
        <Link href="/estante" className="underline underline-offset-4 hover:text-tinta">
          Estante
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        {mundo.nome}
      </h1>
      <p className="mt-2 text-tinta-suave">Você participa como {rotuloDoPapel(mundo.papel)}.</p>

      <div className="mt-8 grid max-w-2xl gap-5">
        <section aria-labelledby="membros" className="painel p-5 sm:p-6">
          <h2 id="membros" className="font-display text-xl font-bold">
            Quem participa
          </h2>
          <ul className="mt-4 grid gap-3">
            {mundo.membros.map((membro) => {
              const apelido = membro.apelido ?? "Perfil removido";
              const aviso = avisoDoMembro(membro.estado);
              return (
                <li key={membro.membroId} className="flex items-center gap-3">
                  <AvatarDoPerfil
                    avatar={membro.avatar ?? "padrao"}
                    apelido={apelido}
                    tamanho="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{apelido}</span>
                    <span className="block text-sm text-tinta-suave">
                      {rotuloDoPapel(membro.papel)}
                      {aviso ? `, ${aviso}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {mundo.papel === "steward" && (
          <section aria-labelledby="convidar" className="painel p-5 sm:p-6">
            <h2 id="convidar" className="font-display text-xl font-bold">
              Convidar alguém
            </h2>
            <p className="mt-2 text-tinta-suave">
              Gere um código e passe para a pessoa. Ela entra no Recreio, abre a estante e usa
              "Entrar com código". Cada código vale uma vez, por 24 horas.
            </p>
            <div className="mt-4">
              <GerarConvite mundoId={mundo.id} />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
