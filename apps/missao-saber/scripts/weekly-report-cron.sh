#!/bin/sh
set -eu

report_failure() {
  printf '{"dsn":"%s"}\n{"type":"event"}\n{"message":"%s","level":"fatal","environment":"production","tags":{"app":"missao-saber","source":"railway-weekly-report"},"fingerprint":["missao-saber-production-weekly-report","%s"]}\n' "$SENTRY_DSN" "$1" "$1" |
    curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
      -H 'Content-Type: application/x-sentry-envelope' --data-binary @- "$SENTRY_ENVELOPE_URL"
}

# Uma vez por semana. O job é idempotente por família e semana, então um
# disparo repetido não manda resumo em dobro; ele só não pode deixar de rodar.
if ! curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 1200 \
  -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/weekly-report"; then
  report_failure 'Missao Saber weekly report request failed'
  exit 1
fi
