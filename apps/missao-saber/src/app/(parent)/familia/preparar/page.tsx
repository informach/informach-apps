import Link from "next/link";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { familyCourseChoices, familyGradeChoices } from "@/features/family/choices";
import { ProfileSetup } from "@/features/family/components/profile-setup";
import { familyDashboard } from "@/features/family/view";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Preparar o estudo" };
export default async function PrepareProfile() {
  const user = await requirePageUser("/familia/preparar");
  const data = await familyDashboard();
  if (data.profiles.length >= data.access.profileLimit)
    return (
      <>
        <CabecalhoPagina
          titulo="Seus estudantes já estão preparados."
          apoio="O plano atual já tem o número de perfis permitido. Você pode abrir o estudo de um deles ou consultar seu plano."
        />
        <Link href="/familia/estudantes" className="font-semibold underline">
          Ver estudantes
        </Link>
        <p className="mt-4">
          <Link href="/familia/conta" className="underline">
            Consultar plano
          </Link>
        </p>
      </>
    );
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="verde">Área do responsável</Etiqueta>}
        titulo="Vamos preparar o primeiro estudo."
        apoio="Depois, você poderá acompanhar as descobertas pelo seu painel."
      />
      <ProfileSetup courses={familyCourseChoices} grades={familyGradeChoices} ownerId={user.id} />
    </>
  );
}
