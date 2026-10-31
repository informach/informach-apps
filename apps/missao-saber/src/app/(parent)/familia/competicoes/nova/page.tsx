import Link from "next/link";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { NovaCompeticao } from "@/features/competition/components/nova-competicao";
import { competitionSetup } from "@/features/competition/service";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Nova competição" };

export default async function Nova() {
  const user = await requirePageUser();
  const { perfis } = await competitionSetup(user.id);
  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="verde">Competições</Etiqueta>}
        titulo="Nova competição"
        apoio="Cada criança recebe perguntas do próprio nível. O sorteio acontece quando você cria a competição."
        acessorio={
          <Link href="/familia/competicoes" className="font-semibold underline">
            Voltar às competições
          </Link>
        }
      />
      <NovaCompeticao perfis={perfis} />
    </div>
  );
}
