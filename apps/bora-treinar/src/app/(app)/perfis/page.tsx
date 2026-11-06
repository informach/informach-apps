import { currentTrainer, PROFILE_COLORS } from "@/features/familia/view";
import { ritmoDaIntensidade } from "@/features/perfil/regras";
import { familySessionsSince } from "@/features/sessoes/repository";
import { semanaAtual } from "@/features/treino/engine/habito";
import { ProfilesScreen } from "@/features/treino/telas/perfis";
import { FUSO_PADRAO, inicioDaSemana, inicioDoDiaLocal, numeroDoDia } from "@/lib/datas";

export const metadata = { title: "Quem vai treinar?" };

export default async function Perfis() {
  const { user, profiles, access, family } = await currentTrainer();
  const fuso = family?.timezone ?? FUSO_PADRAO;
  const agora = Date.now();
  const semana = await familySessionsSince(
    user.id,
    inicioDoDiaLocal(inicioDaSemana(agora, fuso), fuso),
  );
  const hoje = numeroDoDia(agora, fuso);
  const permitidos = profiles.filter((p) => p.allowed).length;
  return (
    <ProfilesScreen
      profiles={profiles.map((p) => {
        const minhas = semana.filter((s) => s.profileId === p.id);
        const s = semanaAtual(minhas, agora, fuso, p.weeklyGoal);
        const treinouHoje = minhas.some((x) => numeroDoDia(x.startedAt, fuso) === hoje);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          allowed: p.allowed,
          pronto: !!p.onboardedAt,
          jeito: {
            ritmo: ritmoDaIntensidade(p.intensity),
            minutos: p.minutesPref,
            dias: p.weeklyGoal,
          },
          status: s.cumprida
            ? "Semana cumprida"
            : treinouHoje
              ? `Treinou hoje · ${s.dias} de ${s.meta}`
              : `${s.dias} de ${s.meta} dias nesta semana`,
        };
      })}
      limit={access.profileLimit}
      colors={PROFILE_COLORS}
      podeTreinarJunto={access.unlocked && permitidos >= 2}
    />
  );
}
