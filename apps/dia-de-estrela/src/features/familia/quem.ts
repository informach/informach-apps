import "server-only";
import { getDeviceIdentity } from "@/features/aparelho/server";
import { getCurrentUser } from "@/lib/auth";
import { familyOfAdult } from "./view";

/**
 * De que família é quem está pedindo: um adulto com conta (titular ou segundo
 * responsável) ou o aparelho conectado da criança. Usado pelas rotas que
 * servem as duas telas (tempo real, voz da tarefa, foto da meta).
 */
export async function requestFamily() {
  const user = await getCurrentUser();
  if (user?.emailVerified) {
    const { ownerId } = await familyOfAdult(user.id);
    return { ownerId, via: "adult" as const, childIds: null };
  }
  const device = await getDeviceIdentity();
  if (device) return { ownerId: device.ownerId, via: "device" as const, childIds: device.childIds };
  return null;
}
