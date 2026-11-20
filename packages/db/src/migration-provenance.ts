/** Immutable provenance of two SQL artifacts that predate the current release.
 * These are receipts of already executed historical SQL, NEVER SQL to replay.
 * GitHub verifies both complete blobs against their published Git commits.
 * No receipt, journal, migration SQL or production history is rewritten here. */
export const INFORMACH_MIGRATION_HISTORY = {
  id: "informach-historical-sql-2026-11-20",
  artifacts: [
    {
      index: 10,
      tag: "0010_create_ai_mastra_schema",
      folderMillis: 1777727429199,
      originalCommit: "8945f70faa35280e479bff361a135fe83458abc7",
      historicalSqlSha256: "ec4eaec8b1fdd2fe5c05a5baa6faa11ab7bccb3b4fa1d709b7bda1f58b17d6fd",
      publishedSqlSha256: "be4e2118ab5f1ab161bb579a74b29a101df09dd1c542150058c22a4e228aa011",
    },
    {
      index: 52,
      tag: "0052_late_rage",
      folderMillis: 1789432818807,
      originalCommit: "3b53c2733f7878c30377bec038c5dcb18042ae8d",
      historicalSqlSha256: "c26ec04b0eb74eb0a2548e6d83c4e57369a36701aaec6bb9985df97ea9848bb4",
      publishedSqlSha256: "8d4418dc0b99e445c1eae9170fdb8214fa2cf972df0cb7e53c824a9082af07fd",
    },
  ],
} as const;

export type MigrationHistoryProfile = "published-only" | typeof INFORMACH_MIGRATION_HISTORY.id;
