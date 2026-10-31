import { describe, expect, it } from "vitest";
import { allowedProfileIds } from "./profile-access";

const profiles = [
  { id: "first", accessEnabled: false },
  { id: "second", accessEnabled: true },
  { id: "third", accessEnabled: false },
];

describe("profile access after plan changes", () => {
  it("allows all stored profiles within the family capacity during a scheduled downgrade", () => {
    expect(allowedProfileIds(profiles, 3)).toEqual(["first", "second", "third"]);
  });

  it("honors the responsible adult's retained profile on an individual plan", () => {
    expect(allowedProfileIds(profiles, 1)).toEqual(["second"]);
  });

  it("falls back deterministically for profiles created before the selection field", () => {
    expect(
      allowedProfileIds(
        profiles.map((profile) => ({ ...profile, accessEnabled: false })),
        1,
      ),
    ).toEqual(["first"]);
  });
});
