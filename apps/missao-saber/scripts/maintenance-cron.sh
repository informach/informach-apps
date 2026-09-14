#!/bin/sh
set -eu

report_failure() {
  printf '{"dsn":"%s"}\n{"type":"event"}\n{"message":"%s","level":"fatal","environment":"production","tags":{"app":"missao-saber","source":"railway-monitor"},"fingerprint":["missao-saber-production-monitor","%s"]}\n' "$SENTRY_DSN" "$1" "$1" |
    curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
      -H 'Content-Type: application/x-sentry-envelope' --data-binary @- "$SENTRY_ENVELOPE_URL"
}

if ! curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "$APP_ORIGIN/api/ready" >/dev/null; then
  report_failure 'Missao Saber readiness check failed'
  exit 1
fi

if ! curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 1200 \
  -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/billing"; then
  report_failure 'Missao Saber billing maintenance request failed'
  exit 1
fi
