#!/bin/sh
set -eu

report_failure() {
  printf '{"dsn":"%s"}\n{"type":"event"}\n{"message":"%s","level":"fatal","environment":"production","tags":{"app":"missao-saber","source":"railway-weekly-report"},"fingerprint":["missao-saber-production-weekly-report","%s"]}\n' "$SENTRY_DSN" "$1" "$1" |
    curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
      -H 'Content-Type: application/x-sentry-envelope' --data-binary @- "$SENTRY_ENVELOPE_URL"
}

# Segunda e terça. O job é idempotente por família e semana: a passada de
# terça reenvia só quem ficou com falha na segunda, sem resumo em dobro. O
# corpo não é persistido, então o reenvio genérico da fila não cobre este caso.
if ! curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 1200 \
  -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/weekly-report"; then
  report_failure 'Missao Saber weekly report request failed'
  exit 1
fi
