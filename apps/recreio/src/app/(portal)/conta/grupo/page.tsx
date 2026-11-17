import Link from "next/link";
import { redirect } from "next/navigation";
import { novosPerfisProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { CoberturaDoGrupo } from "@/features/grupo/components/cobertura";
import { consultarMeuGrupo } from "@/features/grupo/service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Cobertura do grupo" };

export default async function GrupoDaConta({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { ator } = await paginaDaGestao("/conta/grupo");
  const grupo = await consultarMeuGrupo(ator).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  const { salvo } = await searchParams;
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Cobertura do grupo</h1>
      <p className="mt-3 text-tinta-suave">
        Você administra as vagas sem precisar jogar. Cada pessoa conserva seu perfil e seu
        progresso.
      </p>
      {salvo === "1" && (
        <p role="status" className="painel mt-6 p-4 font-semibold">
          Cobertura confirmada. Confira abaixo a seleção atual.
        </p>
      )}
      {grupo ? (
        <>
          <p className="mt-6 text-lg font-semibold">
            {grupo.limite > 0
              ? `A cobertura atual permite ${grupo.limite} ${grupo.limite === 1 ? "jogador" : "jogadores"}.`
              : "Sem cobertura para jogar neste momento. Os perfis continuam guardados."}
          </p>
          {grupo.perfis.length > 0 ? (
            <CoberturaDoGrupo grupo={grupo} novasCoberturas={novosPerfisProtegidosDisponiveis} />
          ) : (
            <p className="painel mt-6 p-5">Nenhum jogador cadastrado neste grupo.</p>
          )}
        </>
      ) : (
        <p className="painel mt-6 p-5">Você ainda não tem um grupo de jogadores.</p>
      )}
      <nav aria-label="Gestão do grupo" className="mt-8 flex flex-wrap gap-5">
        <Link href="/conta/perfis" className="font-bold text-ceu underline">
          Perfis sob sua responsabilidade
        </Link>
        <Link href="/conta" className="font-bold text-ceu underline">
          Voltar à conta
        </Link>
      </nav>
    </div>
  );
}
