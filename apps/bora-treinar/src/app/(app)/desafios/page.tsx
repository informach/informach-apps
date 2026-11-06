import { dadosDoDesafio } from "@/features/desafios/service";
import { DesafiosScreen } from "@/features/desafios/tela";
import { requireTrainer } from "@/features/familia/view";
import { FUSO_PADRAO } from "@/lib/datas";

export const metadata = { title: "Desafios" };

export default async function Desafios() {
  const { user, profile, access, family } = await requireTrainer();
  const dados = await dadosDoDesafio(user.id, profile.id, family?.timezone ?? FUSO_PADRAO, access);
  return <DesafiosScreen profile={profile} dados={dados} />;
}
