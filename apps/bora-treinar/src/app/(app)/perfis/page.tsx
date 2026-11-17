import { webSsoEnvironment } from "@informach/auth/web-sso-contract";
import { getAppUrl } from "@informach/config/domains";
import { listAvailablePeople } from "@/features/familia/service";
import { currentTrainer } from "@/features/familia/view";
import { ritmoDaIntensidade } from "@/features/perfil/regras";
import { volumeDaFamiliaDesde } from "@/features/sessoes/repository";
import { semanaAtual } from "@/features/treino/engine/habito";
import { ProfilesScreen } from "@/features/treino/telas/perfis";
import { FUSO_PADRAO, inicioDaSemana, inicioDoDiaLocal, numeroDoDia } from "@/lib/datas";
import { env } from "@/lib/env";

export const metadata = { title: "Quem vai treinar?" };

export default async function Perfis() {
  const { user, profiles, access, family, group } = await currentTrainer();
  const people = await listAvailablePeople(user.id, group.id);
  const accountUrl = `${getAppUrl("conta", webSsoEnvironment("bora-treinar", env.NEXT_PUBLIC_APP_URL))}/?familia=${group.id}#pessoas`;
  const fuso = family?.timezone ?? FUSO_PADRAO;
  const agora = Date.now();
  const semana = await volumeDaFamiliaDesde(
    user.id,
    group.id,
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
          canWrite: p.canWrite,
          canManage: p.canManage,
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
      people={people}
      accountUrl={accountUrl}
      groupName={group.name}
      podeTreinarJunto={access.unlocked && permitidos >= 2}
    />
  );
}
