import Link from "next/link";
import { redirect } from "next/navigation";
import { DesconectarAparelho } from "@/features/aparelhos/components/desconectar-aparelho";
import { listarAparelhos } from "@/features/aparelhos/service";
import { type Ator, paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Aparelhos" };
const datas = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

async function carregar(ator: Ator, apos: unknown) {
  try {
    return await listarAparelhos(ator, apos);
  } catch (erro) {
    if (erro instanceof AppError && erro.code === "INPUT") redirect("/conta/aparelhos");
    if (erro instanceof AppError && erro.code === "AUTH") redirect("/entrar?encerrada=1");
    throw erro;
  }
}

export default async function Aparelhos({
  searchParams,
}: {
  searchParams: Promise<{ apos?: string | string[] }>;
}) {
  const { ator } = await paginaDaGestao("/conta/aparelhos");
  const { apos } = await searchParams;
  const pagina = await carregar(ator, apos);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Aparelhos</h1>
      <p className="mt-3 text-tinta-suave">
        Veja as sessões da sua conta no Recreio. Datas no horário de Brasília.
      </p>
      <section aria-labelledby="aparelho-atual" className="painel mt-8 p-5 sm:p-6">
        <h2 id="aparelho-atual" className="font-display text-xl font-bold">
          Este aparelho
        </h2>
        <p className="mt-2 text-tinta-suave">
          Você entrou em {datas.format(pagina.atual.criadoEm)}.
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          Para sair daqui, use Sair da conta na página da Conta.
        </p>
      </section>
      <section aria-labelledby="outros-aparelhos" className="mt-6">
        <h2 id="outros-aparelhos" className="font-display text-xl font-bold">
          Outros aparelhos
        </h2>
        <p className="mt-2 text-sm text-tinta-suave">
          Se não reconhecer uma sessão, desconecte o aparelho. Quem estiver usando terá de entrar
          novamente. O progresso já confirmado continua salvo.
        </p>
        {pagina.outros.length === 0 ? (
          <p className="painel mt-4 p-5">Nenhum outro aparelho nesta página.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {pagina.outros.map((item) => (
              <li
                key={item.id}
                className="painel flex flex-wrap items-start justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-semibold">Entrada em {datas.format(item.criadoEm)}</p>
                  <p className="mt-1 text-sm text-tinta-suave">
                    Último acesso: {datas.format(item.vistoEm)}
                  </p>
                </div>
                <DesconectarAparelho id={item.id} iniciadoEm={datas.format(item.criadoEm)} />
              </li>
            ))}
          </ul>
        )}
        <nav aria-label="Páginas de aparelhos" className="mt-4 flex flex-wrap gap-4">
          {apos ? (
            <Link
              className="font-bold text-ceu underline underline-offset-4"
              href="/conta/aparelhos"
            >
              Primeira página
            </Link>
          ) : null}
          {pagina.proximo ? (
            <Link
              className="font-bold text-ceu underline underline-offset-4"
              href={`/conta/aparelhos?apos=${pagina.proximo}`}
            >
              Próximos aparelhos
            </Link>
          ) : null}
        </nav>
      </section>
      <Link
        className="mt-6 inline-block font-bold text-ceu underline underline-offset-4"
        href="/conta"
      >
        Voltar à conta
      </Link>
    </div>
  );
}
