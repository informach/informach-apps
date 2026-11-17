import { PerfilIdSchema } from "@informach/recreio";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupervisaoDoPerfil } from "@/features/politicas/components/supervisao";
import { consultarSupervisao } from "@/features/politicas/service";
import { paginaDaGestao } from "@/features/sessao/ator";
import { AppError } from "@/lib/errors";

export const metadata = { title: "Supervisão" };
export default async function Supervisao({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const perfilId = PerfilIdSchema.safeParse((await params).id);
  if (!perfilId.success) notFound();
  const { ator } = await paginaDaGestao(`/conta/perfis/${perfilId.data}/supervisao`);
  const pagina = await consultarSupervisao(ator, perfilId.data).catch((erro: unknown) => {
    if (erro instanceof AppError && erro.code === "PERFIL") notFound();
    throw erro;
  });
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-bold uppercase tracking-widest text-sol">Cuidados do perfil</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight [overflow-wrap:anywhere]">
        Supervisão de {pagina.apelido}
      </h1>
      <p className="mt-3 text-tinta-suave">
        Você define os cuidados de conteúdo, companhia e tempo. O progresso dentro dos jogos
        continua privado.
      </p>
      {(await searchParams).salvo === "1" && (
        <p role="status" className="painel mt-5 p-4 font-semibold">
          Supervisão confirmada. Confira abaixo as regras atuais.
        </p>
      )}
      {pagina.politica.precisaContaAdulta && (
        <p className="painel mt-5 p-4">
          Este perfil já alcançou a idade adulta. Os cuidados continuam até a transição para uma
          conta própria.
        </p>
      )}
      <SupervisaoDoPerfil
        perfilId={perfilId.data}
        configuracao={pagina.configuracao}
        versao={pagina.versao}
        reconhecida={pagina.reconhecida}
        faixa={pagina.politica.faixaDaIdade}
        adolescente={pagina.politica.faixaSocial === "13_17"}
      />
      <Link href="/conta/perfis" className="mt-3 inline-block font-bold text-ceu underline">
        Voltar aos perfis
      </Link>
    </div>
  );
}
