#!/bin/sh
# Rotina de 5 em 5 minutos do Dia de Estrela: primeiro os alertas aos pais
# (sensíveis ao horário), depois a manutenção da cobrança. Uma falha numa não
# impede a outra; o código de saída diz se alguma falhou.
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

status=0
if ! curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 240 \
  -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/alertas"; then
  report_failure 'Dia de Estrela parent alerts request failed'
  status=1
fi

if ! curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 1200 \
  -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/billing"; then
  report_failure 'Dia de Estrela billing maintenance request failed'
  status=1
fi

exit $status
