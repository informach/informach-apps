import { canUseChallenges } from "@/features/acesso/policy";
import { placar } from "@/features/desafios/placar";
import { challengeOf } from "@/features/desafios/repository";
import { DesafiosScreen } from "@/features/desafios/tela";
import { requireTrainer } from "@/features/familia/view";
import { familySessionsSince } from "@/features/sessoes/repository";
import { FUSO_PADRAO, inicioDaSemana, inicioDoDiaLocal } from "@/lib/datas";

export const metadata = { title: "Desafios" };

export default async function Desafios() {
  const { user, profile, access, family, profiles } = await requireTrainer();
  const fuso = family?.timezone ?? FUSO_PADRAO;
  const semana = inicioDaSemana(new Date(), fuso);
  const allowed = canUseChallenges(access);
  const desafio = allowed ? await challengeOf(user.id, semana) : null;
  const sessoes = desafio ? await familySessionsSince(user.id, inicioDoDiaLocal(semana, fuso)) : [];
  return (
    <DesafiosScreen
      profile={profile}
      allowed={allowed}
      desafio={desafio}
      semana={semana}
      placar={
        desafio
          ? placar(
              desafio,
              sessoes.map((s) => ({ ...s, durationSeconds: s.duration })),
              profiles.filter((p) => p.allowed),
            )
          : null
      }
    />
  );
}
