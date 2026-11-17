/** Resolved on the server. Household membership never substitutes for a child's grant. */
type FamilyActor = { userId: string; familyGroupId: string };

export type AdultAuthority = FamilyActor & { kind: "adult" };
export type ChildAuthority = FamilyActor & {
  kind: "child";
  deviceId: string;
  childId: string;
};
/** Limited parent operations, bound to the device, current PIN generation and expiry. */
export type PinAuthority = FamilyActor & {
  kind: "pin";
  deviceId: string;
  pinGeneration: string;
  unlockedUntil: number;
};
export type ParentAuthority = AdultAuthority | PinAuthority;
export type EstrelaAuthority = ParentAuthority | ChildAuthority;
