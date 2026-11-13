import { describe, expect, it } from "vitest";
import { assessMigrationHistory } from "./migration-history";

describe("migration history admission", () => {
  const expected = [10, 20, 30];
  it("admits an empty database and an intact pending suffix for migration", () => {
    expect(assessMigrationHistory(expected, [])).toBe("behind");
    expect(assessMigrationHistory(expected, [10, 20])).toBe("behind");
  });
  it("requires every receipt even when the latest migration is present", () => {
    expect(assessMigrationHistory(expected, [10, 30])).toBe("inconsistent");
    expect(assessMigrationHistory(expected, [30])).toBe("inconsistent");
  });
  it("allows an intact newer database without requiring an exact version", () => {
    expect(assessMigrationHistory(expected, expected)).toBe("ready");
    expect(assessMigrationHistory(expected, [10, 20, 30, 40])).toBe("ready");
  });
  it("rejects a newer database that would silently skip this branch", () => {
    expect(assessMigrationHistory(expected, [10, 40])).toBe("inconsistent");
    expect(assessMigrationHistory(expected, [10, 20, 40])).toBe("inconsistent");
  });
  it("rejects unknown, duplicate, invalid or reordered receipts", () => {
    for (const applied of [[10, 15, 20, 30], [10, 20, 20, 30], [20, 10], [NaN], [1.5]])
      expect(assessMigrationHistory(expected, applied)).toBe("inconsistent");
  });
  it("rejects an invalid build journal before trusting the database", () => {
    expect(assessMigrationHistory([10, 10], [10])).toBe("inconsistent");
    expect(assessMigrationHistory([20, 10], [])).toBe("inconsistent");
    expect(assessMigrationHistory([], [])).toBe("ready");
  });
});
