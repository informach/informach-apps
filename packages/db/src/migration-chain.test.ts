import { describe, expect, it } from "vitest";
import { verifyRestoredMigrationPrefix } from "./migration-chain";

describe("restored SQL migration provenance", () => {
  const files = [
    { hash: "a".repeat(64), folderMillis: 10 },
    { hash: "b".repeat(64), folderMillis: 20 },
    { hash: "c".repeat(64), folderMillis: 30 },
  ];
  const receipts = files.map((f) => ({ hash: f.hash, createdAt: String(f.folderMillis) }));
  it("admits only the exact authenticated prefix and reports the pending suffix", () => {
    expect(verifyRestoredMigrationPrefix(files, receipts.slice(0, 2))).toEqual({
      before: 2,
      target: 3,
      pending: 1,
    });
    expect(verifyRestoredMigrationPrefix(files, receipts)).toEqual({
      before: 3,
      target: 3,
      pending: 0,
    });
  });
  it("does not bootstrap an unproven or future restored database", () => {
    expect(() => verifyRestoredMigrationPrefix(files, [])).toThrow("HISTORY_MISSING");
    expect(() =>
      verifyRestoredMigrationPrefix(files, [
        ...receipts,
        { hash: "d".repeat(64), createdAt: "40" },
      ]),
    ).toThrow("HISTORY_FUTURE");
    expect(() =>
      verifyRestoredMigrationPrefix(files, [{ hash: "d".repeat(64), createdAt: "40" }]),
    ).toThrow("HISTORY_FUTURE");
  });
  it("rejects changed SQL hashes, holes, duplicates and noncanonical timestamps", () => {
    const first = receipts[0],
      second = receipts[1],
      third = receipts[2];
    if (!first || !second || !third) throw new Error("Missing fixture receipts");
    for (const value of [
      [{ ...first, hash: "f".repeat(64) }],
      [first, third],
      [first, first],
      [first, { ...second, createdAt: "20.5" }],
      [first, { ...second, createdAt: "NaN" }],
      [first, { ...second, createdAt: "020" }],
    ])
      expect(() => verifyRestoredMigrationPrefix(files, value)).toThrow("HISTORY_INCONSISTENT");
  });
  it("rejects invalid or sparse release metadata before trusting it", () => {
    const sparse = Array<(typeof files)[number]>(2);
    sparse[0] = { hash: "a".repeat(64), folderMillis: 10 };
    for (const value of [
      [],
      sparse,
      [{ hash: "invalid", folderMillis: 10 }],
      [
        { hash: "a".repeat(64), folderMillis: 10 },
        { hash: "b".repeat(64), folderMillis: 10 },
      ],
    ])
      expect(() => verifyRestoredMigrationPrefix(value, receipts.slice(0, 1))).toThrow(
        "FILES_INVALID",
      );
  });
});
