-- Somente o container descartável do GitHub. Nenhum dado ou credencial real.
CREATE SCHEMA recreio;
CREATE ROLE recreio_backup_reader NOLOGIN;
-- Senha publica SOMENTE desta fixture, que a recuperacao nao deve transportar.
CREATE ROLE recreio_backup_login LOGIN PASSWORD 'ci';
CREATE ROLE recreio_backup_parent NOLOGIN NOINHERIT CONNECTION LIMIT 3 VALID UNTIL '2030-01-01 00:00:00+00';
ALTER ROLE recreio_backup_reader SET default_transaction_read_only=on;
ALTER ROLE recreio_backup_reader SET statement_timeout='15000ms';
GRANT recreio_backup_parent TO recreio_backup_reader WITH ADMIN TRUE;
GRANT recreio_backup_parent TO recreio_backup_reader WITH INHERIT FALSE;
GRANT recreio_backup_parent TO recreio_backup_reader WITH SET FALSE;
CREATE TABLE recreio.spaces (
  id uuid PRIMARY KEY,
  nome text NOT NULL
);
CREATE TABLE recreio.space_snapshots (
  space_id uuid NOT NULL REFERENCES recreio.spaces(id),
  revision integer NOT NULL,
  bytes bytea NOT NULL,
  dados jsonb NOT NULL,
  em timestamptz NOT NULL,
  PRIMARY KEY (space_id, revision)
);
CREATE INDEX snapshot_em_idx ON recreio.space_snapshots(em);
INSERT INTO recreio.spaces VALUES (
  '00000000-0000-4000-8000-000000000001', 'FIXTURE_NAO_PUBLICAR_CONTEUDO'
);
INSERT INTO recreio.space_snapshots VALUES (
  '00000000-0000-4000-8000-000000000001', 1, decode('0001ff', 'hex'),
  '{"texto":"FIXTURE_NAO_PUBLICAR_CONTEUDO","valor":3}', '2026-11-15T10:00:00Z'
);
GRANT USAGE ON SCHEMA recreio TO recreio_backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA recreio TO recreio_backup_reader;
