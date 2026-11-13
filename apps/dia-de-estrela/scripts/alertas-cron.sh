#!/bin/sh
# Alertas "não marcou" aos pais do Dia de Estrela, de 5 em 5 minutos.
set -eu

report_failure() {
  printf '{"dsn":"%s"}\n{"type":"event"}\n{"message":"%s","level":"fatal","environment":"production","tags":{"app":"dia-de-estrela","source":"railway-monitor"},"fingerprint":["dia-de-estrela-production-monitor","%s"]}\n' "$SENTRY_DSN" "$1" "$1" |
    curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
      -H 'Content-Type: application/x-sentry-envelope' --data-binary @- "$SENTRY_ENVELOPE_URL"
}

if ! curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "$APP_ORIGIN/api/ready" >/dev/null; then
  report_failure 'Dia de Estrela readiness check failed'
  exit 1
fi

# A rotina para sozinha em 50 s e continua de onde parou na execução seguinte.
if ! curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 150 \
  -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/alertas"; then
  report_failure 'Dia de Estrela parent alerts request failed'
  exit 1
fi
