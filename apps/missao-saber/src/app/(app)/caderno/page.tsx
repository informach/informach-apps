import { EmptyProfile } from "@/components/empty-profile";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { Notebook } from "@/features/learning/components/notebook";
import { listNotes } from "@/features/learning/repository";
import { requirePageUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

export const metadata = { title: "Caderno" };

export default async function Notes() {
  const data = await currentDashboard();
  if (!data.profile) return <EmptyProfile />;
  const user = await requirePageUser();
  const notes = await listNotes(user.id, data.profile.id);
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="sol">As ideias ficam melhores com suas palavras</Etiqueta>}
        titulo="Meu caderno de descobertas."
        apoio="Uma hipótese, um desenho descrito, uma explicação que finalmente fez sentido. Este espaço é seu."
      />
      <Notebook
        profileId={data.profile.id}
        notes={notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
      />
    </>
  );
}
