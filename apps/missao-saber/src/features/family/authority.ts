/** Resolved on the server; a study device cannot become an adult context. */
type FamilyActor = {
  userId: string;
  familyGroupId: string;
};

export type ParentAuthority = FamilyActor & { kind: "parent" };
/** A child's selected student remains part of every domain request. */
export type StudyAuthority = FamilyActor & {
  kind: "study";
  deviceId: string;
  profileId: string;
};
export type LearningAuthority = ParentAuthority | StudyAuthority;
