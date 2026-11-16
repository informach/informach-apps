import Link from "next/link";
import { redirect } from "next/navigation";
import { SairDoMundo } from "@/features/mundos/components/sair-do-mundo";
import { listarParticipacoes } from "@/features/mundos/participacoes";
import { type AtorComPerfil, paginaDoPortal } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Participações em mundos" };

async function carregar(ator: AtorComPerfil, apos: unknown) {
  try {
    return await listarParticipacoes(
      {
        contaId: ator.contaId,
        perfilId: ator.perfil.id,
        sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
      },
      apos,
    );
  } catch (erro) {
    if (erro instanceof AppError && erro.code === "INPUT") redirect("/conta/mundos");
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  }
}

const estados = {
  active: "Participação ativa",
  away: "Participação afastada",
  no_access: "Participação sem acesso",
  former: "Participação encerrada",
};
const papeis = { steward: "Responsável", coadmin: "Coadministrador", member: "Membro" };

export default async function Participacoes({
  searchParams,
}: {
  searchParams: Promise<{ apos?: string | string[] }>;
}) {
  const { ator } = await paginaDoPortal();
  const { apos } = await searchParams;
  const pagina = await carregar(ator, apos);
  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Participações em mundos
      </h1>
      <p className="mt-3 max-w-2xl text-tinta-suave">
        Confira seus vínculos, inclusive quando estiver afastado ou sem acesso para jogar. Sair de
        um mundo não apaga os personagens nem o progresso de quem continua.
      </p>
      {pagina.itens.length === 0 ? (
        <p className="painel mt-8 p-5">Nenhuma participação nesta página.</p>
      ) : (
        <ul className="mt-8 grid max-w-2xl gap-4">
          {pagina.itens.map((item) => (
            <li key={item.id} className="painel p-5 sm:p-6">
              <h2 className="font-display text-xl font-bold [overflow-wrap:anywhere]">
                {item.nome}
              </h2>
              <p className="mt-2 text-tinta-suave">
                {papeis[item.papel]} · {estados[item.estado]}
              </p>
              <Link
                href={`/conta/mundos/${item.mundoId}/responsabilidade`}
                className="mt-3 flex w-fit font-bold text-ceu underline underline-offset-4"
              >
                Responsabilidade pelo mundo
              </Link>
              {item.estado === "active" &&
              (item.estadoDoMundo === "active" || item.estadoDoMundo === "hibernating") ? (
                <Link
                  href={`/mundos/${item.mundoId}`}
                  className="mt-3 inline-flex font-bold text-ceu underline underline-offset-4"
                >
                  Ver mundo
                </Link>
              ) : null}
              {item.papel === "steward" ? (
                <p className="mt-3 text-sm text-tinta-suave">
                  Para sair, transfira a responsabilidade e espere a outra pessoa aceitar.
                </p>
              ) : (
                <SairDoMundo mundoId={item.mundoId} />
              )}
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Páginas de participações" className="mt-5 flex flex-wrap gap-4">
        {apos ? (
          <Link href="/conta/mundos" className="font-bold text-ceu underline underline-offset-4">
            Primeira página
          </Link>
        ) : null}
        {pagina.proximo ? (
          <Link
            href={`/conta/mundos?apos=${pagina.proximo}`}
            className="font-bold text-ceu underline underline-offset-4"
          >
            Próximas participações
          </Link>
        ) : null}
      </nav>
      <Link
        href="/conta"
        className="mt-6 inline-flex font-bold text-ceu underline underline-offset-4"
      >
        Voltar à Conta
      </Link>
    </>
  );
}
