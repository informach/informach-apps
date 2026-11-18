import Link from "next/link";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { CadastrarMenor } from "@/features/familia/components/cadastrar-menor";
import { novosPerfisProtegidosDisponiveis } from "@/features/familia/disponibilidade";
import { listarPerfisMenores } from "@/features/familia/service";
import { AvatarDoPerfil } from "@/features/perfis/components/avatar";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Perfis sob sua responsabilidade" };

export default async function PerfisDaFamilia({
  searchParams,
}: {
  searchParams: Promise<{ apos?: string | string[] }>;
}) {
  const { ator } = await paginaDaGestao("/conta/perfis");
  const { apos } = await searchParams;
  const pagina = await listarPerfisMenores(ator, apos).catch((erro: unknown) => {
    if (erro instanceof ZodError) redirect("/conta/perfis");
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        Perfis sob sua responsabilidade
      </h1>
      <p className="mt-3 text-tinta-suave">
        Cadastre quem vai jogar. Você pode cuidar dos perfis sem criar um jogador para si. O plano
        Individual cobre um jogador e o Família, até quatro.
      </p>
      <section aria-labelledby="perfis-cadastrados" className="mt-8">
        <h2 id="perfis-cadastrados" className="font-display text-xl font-bold">
          Crianças e adolescentes
        </h2>
        {pagina.itens.length === 0 ? (
          <p className="painel mt-4 p-5">Nenhum perfil nesta página.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {pagina.itens.map(({ perfil, faixas }) => (
              <li key={perfil.id} className="painel flex items-center gap-4 p-5">
                <AvatarDoPerfil avatar={perfil.avatar} apelido={perfil.apelido} />
                <div className="min-w-0">
                  <h3 className="font-bold [overflow-wrap:anywhere]">{perfil.apelido}</h3>
                  <Link
                    href={`/conta/perfis/${perfil.id}/supervisao`}
                    className="mt-2 block font-bold text-ceu underline"
                  >
                    Supervisionar {perfil.apelido}
                  </Link>
                  <Link
                    href={`/conta/perfis/${perfil.id}/aparelhos`}
                    className="mt-2 inline-block font-bold text-ceu underline"
                  >
                    Gerenciar aparelhos de {perfil.apelido}
                  </Link>
                  <Link
                    href={`/conta/perfis/${perfil.id}/contatos`}
                    className="mt-2 block font-bold text-ceu underline"
                  >
                    Contatos e pedidos de {perfil.apelido}
                  </Link>
                  <Link
                    href={`/conta/perfis/${perfil.id}/restricao`}
                    className="mt-2 block font-bold text-ceu underline"
                  >
                    Acesso e revisão de {perfil.apelido}
                  </Link>
                  <Link
                    href={`/conta/perfis/${perfil.id}/denuncias`}
                    className="mt-2 block font-bold text-ceu underline"
                  >
                    Denúncias de {perfil.apelido}
                  </Link>
                  <Link
                    href={`/conta/perfis/${perfil.id}/mundos`}
                    className="mt-2 block font-bold text-ceu underline"
                  >
                    Mundos de {perfil.apelido}
                  </Link>
                  <p className="mt-1 text-sm text-tinta-suave">
                    {perfil.status === "active" ? "Ativo" : "Suspenso"} · Conteúdo até{" "}
                    {faixas.classificacao === "L" ? "Livre" : `${faixas.classificacao} anos`}
                  </p>
                  {faixas.precisaContaAdulta && (
                    <p className="mt-1 text-sm text-tinta-suave">
                      Já pode ter uma conta adulta. Os cuidados deste perfil continuam até a
                      transição.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <nav aria-label="Páginas de perfis" className="mt-4 flex gap-4">
          {apos && (
            <Link href="/conta/perfis" className="font-bold text-ceu underline">
              Primeira página
            </Link>
          )}
          {pagina.proximo && (
            <Link
              href={`/conta/perfis?apos=${pagina.proximo}`}
              className="font-bold text-ceu underline"
            >
              Próximos perfis
            </Link>
          )}
        </nav>
      </section>
      {novosPerfisProtegidosDisponiveis && <CadastrarMenor anoAtual={pagina.anoAtual} />}
      <Link href="/conta" className="mt-6 inline-block font-bold text-ceu underline">
        Voltar à conta
      </Link>
    </div>
  );
}
