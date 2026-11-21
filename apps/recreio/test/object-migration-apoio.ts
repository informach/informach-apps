import { randomBytes, randomUUID } from "node:crypto";
export function fixtureDeMigracao() {
  return {
    DATABASE_URL: `postgresql://fixture:synthetic@127.0.0.1:5432/recreio_review_${"a".repeat(32)}`,
    CI: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "informach/informach-apps",
    RECREIO_OBJECTS_MODE: "read",
    RECREIO_OBJECTS_SCOPE: "qualification",
    RECREIO_OBJECTS_BUCKET_ID: randomUUID(),
    RECREIO_OBJECTS_BUCKET: "recreio-homologacao-fixture",
    RECREIO_OBJECTS_ENDPOINT: "https://t3.storageapi.dev",
    RECREIO_OBJECTS_REGION: "auto",
    RECREIO_OBJECTS_PATH_STYLE: "1",
    RECREIO_OBJECTS_ACCESS_KEY: "synthetic-access",
    RECREIO_OBJECTS_SECRET_KEY: "synthetic-secret-never-real",
    RECREIO_OBJECTS_ACTIVE_KEY: "v1",
    RECREIO_OBJECTS_KEYS: JSON.stringify({ v1: randomBytes(32).toString("base64") }),
    RECREIO_OBJECTS_MIGRATION_MODE: "process",
    RECREIO_OBJECTS_MIGRATION_BACKUP_ID: randomUUID(),
    RECREIO_OBJECTS_MIGRATION_READER_SOURCE: "a".repeat(40),
    RECREIO_OBJECTS_MIGRATION_READER_ORIGIN: "http://127.0.0.1:3019",
  };
}
