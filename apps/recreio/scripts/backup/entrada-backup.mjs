// Fixed native entry points only. Existing restore rehearsals keep their
// default path; scheduled operation requires an explicit mode and its guards.
if (process.env.RECREIO_BACKUP_MODE === undefined) {
  await import("./ensaiar-backup.mjs");
} else {
  await import("./operar-backup.cjs");
}
