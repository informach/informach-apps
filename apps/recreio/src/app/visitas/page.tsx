import { ConsultaDeVisitasSchema } from "@informach/recreio/contrato";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Marca } from "@/components/desenhos";
import { paginaDoJogador } from "@/features/autoridade-de-jogo/http";
import { RecibosDeVisita } from "@/features/visitas/components/recibos-de-visita";
import { caixaDeVisitas } from "@/features/visitas/consulta-repository";

export const metadata = { title: "Visitas com amigos" };
export default async function Visitas({
  searchParams,
}: {
  searchParams: Promise<{ aposEm?: string; aposId?: string }>;
}) {
  const consulta = ConsultaDeVisitasSchema.safeParse(await searchParams);
  if (!consulta.success) notFound();
  const jogador = await paginaDoJogador("/visitas"),
    voltar = jogador.protegido ? "/aparelho" : "/estante";
  const caixa = await caixaDeVisitas(
    { perfilId: jogador.perfil.id, sessaoDeAparelhoId: jogador.sessaoDeAparelhoId },
    consulta.data,
  );
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href={voltar} aria-label="Recreio, voltar para jogar">
          <Marca tamanho={30} />
        </Link>
        <nav aria-label="Navegação das visitas" className="flex flex-wrap gap-3">
          <Link className="rb rb-vazado" href="/convites">
            Convites de mundos
          </Link>
          <Link className="rb rb-vazado" href={voltar}>
            Voltar para jogar
          </Link>
        </nav>
      </header>
      <p className="mt-10 text-xs font-bold uppercase tracking-widest text-sol">
        Encontro com amigos
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
        Visitas de {jogador.perfil.apelido}
      </h1>
      <p className="mt-5 max-w-2xl text-tinta-suave">
        Confira quem convida antes de aceitar. A visita depende da presença do anfitrião e dos
        cuidados de cada perfil, e não cria participação permanente.
      </p>
      <RecibosDeVisita caixa={caixa} destino="/visitas" perfilJogador={jogador.perfil.id} />
    </main>
  );
}
