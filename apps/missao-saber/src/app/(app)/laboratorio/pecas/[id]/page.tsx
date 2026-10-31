import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyProfile } from "@/components/empty-profile";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { encontrarDesafio, rotuloFaixa } from "@/features/pecas/catalogo";
import { Treino } from "@/features/pecas/components/treino";
import { desafioLiberado } from "@/features/pecas/esquema";
import { currentDashboard } from "@/lib/view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const desafio = encontrarDesafio((await params).id);
  return { title: desafio ? desafio.nome : "Desafio de peças" };
}

export default async function DesafioDePecas({ params }: { params: Promise<{ id: string }> }) {
  const desafio = encontrarDesafio((await params).id);
  if (!desafio) notFound();
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const liberado = desafioLiberado(desafio, {
    pago: data.access.paid,
    perfilLiberado: data.profileAllowed,
  });
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="ceu">Desafio de peças · {rotuloFaixa[desafio.faixa]}</Etiqueta>}
        titulo={desafio.nome}
        apoio={desafio.objetivo}
        acessorio={
          <Link href="/laboratorio/pecas" className="font-semibold underline">
            Todos os desafios
          </Link>
        }
      />
      {liberado ? (
        <Treino desafioId={desafio.id} profileId={data.profile.id} />
      ) : (
        <p className="rounded-card border-2 border-sombra bg-creme p-5">
          Este desafio faz parte da assinatura. Os desafios abertos estão na lista.
        </p>
      )}
    </>
  );
}
