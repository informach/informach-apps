import { currentTrainer, PROFILE_COLORS } from "@/features/familia/view";
import { ProfilesScreen } from "@/features/treino/telas/perfis";

export const metadata = { title: "Quem vai treinar?" };

export default async function Perfis() {
  const { profiles, access } = await currentTrainer();
  return (
    <ProfilesScreen
      profiles={profiles.map(({ id, name, color, allowed }) => ({ id, name, color, allowed }))}
      limit={access.profileLimit}
      colors={PROFILE_COLORS}
    />
  );
}
