import "server-only";
import { childAuthority, getDeviceIdentity, pinUnlock } from "@/features/aparelho/server";
import { getCurrentUser } from "@/lib/auth";
import type { EstrelaAuthority } from "./authority";
import { selectedFamilyContext } from "./context";
/** Shared file routes still pass the full current authority into each query. */
export async function requestFamily(): Promise<EstrelaAuthority | null> {
  const user = await getCurrentUser();
  if (user?.emailVerified) {
    const family = await selectedFamilyContext(user.id);
    return family ? { kind: "adult", userId: user.id, familyGroupId: family.id } : null;
  }
  const pin = await pinUnlock();
  if (pin) return pin.actor;
  const device = await getDeviceIdentity();
  return device?.childId ? childAuthority(device, device.childId) : null;
}
