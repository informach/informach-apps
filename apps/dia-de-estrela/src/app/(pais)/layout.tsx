import Link from "next/link";
import { Lumi } from "@/components/desenhos";
import { PaisNav } from "@/components/pais-nav";
import { TempoReal } from "@/components/tempo-real";
import { VoltarParaCrianca } from "@/components/voltar-crianca";
import { parentPage } from "@/features/familia/view";

export default async function LayoutDosPais({ children }: { children: React.ReactNode }) {
  const ctx = await parentPage();
  return (
    <div data-area="pais" className="min-h-dvh bg-creme">
      {ctx.mode === "pin" && <VoltarParaCrianca ate={ctx.unlockedUntil} />}
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-0 lg:h-dvh lg:border-r-2 lg:border-linha lg:bg-white">
          <Link href="/inicio" className="hidden items-center gap-2 px-6 pt-6 pb-4 lg:flex">
            <Lumi tamanho={34} />
            <span className="font-display text-xl font-extrabold">Dia de Estrela</span>
          </Link>
          <PaisNav />
        </aside>
        <main
          id="conteudo"
          className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 lg:px-8 lg:pt-8 lg:pb-12"
        >
          <header className="mb-4 flex items-center justify-between lg:hidden">
            <Link href="/inicio" className="flex items-center gap-2">
              <Lumi tamanho={30} />
              <span className="font-display text-xl font-extrabold">Dia de Estrela</span>
            </Link>
          </header>
          {ctx.mode === "adult" && (
            <Link
              href="/contexto"
              className="mb-4 inline-flex min-h-11 items-center text-sm font-bold underline"
            >
              Escolher família
            </Link>
          )}
          {children}
        </main>
      </div>
      <TempoReal intervaloMs={45_000} />
    </div>
  );
}
