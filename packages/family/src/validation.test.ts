import { describe, expect, it } from "vitest";
import { personSchema, targetSchema } from "./validation";

describe("family boundary validation", () => {
  const groupId = "b08be9db-540b-40d9-915f-dcf4c12519c4";
  const personId = "265b52fa-c3ea-41a9-88da-dc893da351c2";
  it("rejects payment, desktop and unknown capabilities", () => {
    for (const action of ["billing", "owner", "*"]) {
      expect(targetSchema.safeParse({ groupId, personId, app: "cozya", action }).success).toBe(
        false,
      );
    }
    expect(targetSchema.safeParse({ groupId, personId, app: "edi", action: "read" }).success).toBe(
      false,
    );
  });
  it("does not collect extra child data through the shared identity boundary", () => {
    const input = { groupId, kind: "dependent", displayName: "Clara" };
    expect(personSchema.safeParse(input).success).toBe(true);
    expect(personSchema.safeParse({ ...input, birthDate: "2014-01-01" }).success).toBe(false);
    expect(personSchema.safeParse({ ...input, userId: "another-adult" }).success).toBe(false);
  });
});
