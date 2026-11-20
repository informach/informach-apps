import { describe, expect, it } from "vitest";
import { verifyRestoredMigrationPrefix } from "./migration-chain";
import { INFORMACH_MIGRATION_HISTORY } from "./migration-provenance";

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
      historicalVariantsVerified: 0,
    });
    expect(verifyRestoredMigrationPrefix(files, receipts)).toEqual({
      before: 3,
      target: 3,
      pending: 0,
      historicalVariantsVerified: 0,
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

  it("recognizes exact original Git artifacts only under the explicit historical profile", () => {
    const [first, second] = INFORMACH_MIGRATION_HISTORY.artifacts;
    const knownFiles = Array.from({ length: 53 }, (_, i) => ({
      hash: i.toString(16).padStart(64, "0"),
      folderMillis: i < 10 ? i + 1 : i < 52 ? first.folderMillis + i - 10 : second.folderMillis,
    }));
    knownFiles[10] = { hash: first.publishedSqlSha256, folderMillis: first.folderMillis };
    knownFiles[52] = { hash: second.publishedSqlSha256, folderMillis: second.folderMillis };
    const original = knownFiles.map((f) => ({ hash: f.hash, createdAt: String(f.folderMillis) }));
    original[10] = { hash: first.historicalSqlSha256, createdAt: String(first.folderMillis) };
    original[52] = { hash: second.historicalSqlSha256, createdAt: String(second.folderMillis) };
    expect(() => verifyRestoredMigrationPrefix(knownFiles, original)).toThrow(
      "HISTORY_INCONSISTENT",
    );
    const profile = INFORMACH_MIGRATION_HISTORY.id;
    expect(verifyRestoredMigrationPrefix(knownFiles, original, profile)).toEqual({
      before: 53,
      target: 53,
      pending: 0,
      historicalVariantsVerified: 2,
    });
    const changedReceipt = original.map((r, i) => (i === 10 ? { ...r, hash: "f".repeat(64) } : r));
    expect(() => verifyRestoredMigrationPrefix(knownFiles, changedReceipt, profile)).toThrow(
      "HISTORY_INCONSISTENT",
    );
    const changedRelease = knownFiles.map((f, i) =>
      i === 10 ? { ...f, hash: "f".repeat(64) } : f,
    );
    expect(() => verifyRestoredMigrationPrefix(changedRelease, original, profile)).toThrow(
      "HISTORY_INCONSISTENT",
    );
    const redatedFiles = knownFiles.map((f, i) =>
      i >= 10 && i < 52 ? { ...f, folderMillis: f.folderMillis + 1 } : f,
    );
    const redatedReceipts = original.map((r, i) =>
      i >= 10 && i < 52 ? { ...r, createdAt: String(Number(r.createdAt) + 1) } : r,
    );
    expect(() => verifyRestoredMigrationPrefix(redatedFiles, redatedReceipts, profile)).toThrow(
      "HISTORY_INCONSISTENT",
    );
  });
});
