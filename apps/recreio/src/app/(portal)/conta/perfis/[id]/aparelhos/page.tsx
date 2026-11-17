import { PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AprovarAparelho } from "@/features/protecao/components/aprovar-aparelho";
import { DesconectarAparelhoDoMenor } from "@/features/protecao/components/encerrar-aparelho";
import { listarAparelhosDoMenor } from "@/features/protecao/service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Aparelhos do perfil" };
const datas = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
export default async function AparelhosDoPerfil({ params }: { params: Promise<{ id: string }> }) {
  const pedido = PerfilIdSchema.safeParse((await params).id);
  if (!pedido.success) notFound();
  const { ator } = await paginaDaGestao(`/conta/perfis/${pedido.data}/aparelhos`);
  const pagina = await listarAparelhosDoMenor(ator, pedido.data).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "PERFIL") notFound();
    throw erro;
  });
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Aparelhos de {pagina.perfil.apelido}
      </h1>
      <p className="mt-3 text-tinta-suave">
        Cada aparelho pareado abre somente este perfil. Você pode desconectar um aparelho a qualquer
        momento. Datas no horário de Brasília.
      </p>
      <AprovarAparelho perfilId={pedido.data} apelido={pagina.perfil.apelido} />
      <section aria-labelledby="aparelhos-perfil" className="mt-8">
        <h2 id="aparelhos-perfil" className="font-display text-xl font-bold">
          Aparelhos pareados
        </h2>
        {pagina.aparelhos.length === 0 ? (
          <p className="painel mt-4 p-5">Nenhum aparelho pareado neste perfil.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {pagina.aparelhos.map((item) => (
              <li
                key={item.id}
                className="painel flex flex-wrap items-start justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-semibold">
                    Pareado em {datas.format(new Date(item.criadoEm))}
                  </p>
                  <p className="mt-1 text-sm text-tinta-suave">
                    {item.estado === "ativo"
                      ? "Ativo"
                      : item.estado === "aguardando"
                        ? "Aguardando a confirmação do aparelho"
                        : "Encerrado"}{" "}
                    · Válido até {datas.format(new Date(item.expiraEm))}
                  </p>
                </div>
                {item.estado !== "encerrado" && (
                  <DesconectarAparelhoDoMenor perfilId={pedido.data} aparelhoId={item.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/conta/perfis" className="mt-6 inline-block font-bold text-ceu underline">
        Voltar aos perfis
      </Link>
    </div>
  );
}
