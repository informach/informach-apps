#!/bin/sh
set -eu

report_failure() {
  printf '{"dsn":"%s"}\n{"type":"event"}\n{"message":"%s","level":"fatal","environment":"production","tags":{"app":"missao-saber","source":"railway-weekly-report"},"fingerprint":["missao-saber-production-weekly-report","%s"]}\n' "$SENTRY_DSN" "$1" "$1" |
    curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \
      -H 'Content-Type: application/x-sentry-envelope' --data-binary @- "$SENTRY_ENVELOPE_URL"
}

# Cada família concluída tem checkpoint durável. Uma reinicialização volta ao
# primeiro pendente; a deduplicação da entrega cobre quedas antes do checkpoint.
# Falhas não impedem os lotes seguintes e ficam para a próxima execução.
headers_file=$(mktemp)
body_file=$(mktemp)
trap 'rm -f "$headers_file" "$body_file"' EXIT HUP INT TERM
cursor=''
week=''
failed=0
started=$(date +%s)
while :; do
  if [ $(( $(date +%s) - started )) -ge 1200 ]; then
    report_failure 'Missao Saber weekly report reached execution budget'
    exit 1
  fi
  query="?after=$cursor&week=$week"
  if [ -z "$cursor" ]; then query=''; fi
  if ! status=$(curl --silent --show-error --connect-timeout 15 --max-time 180 \
    -D "$headers_file" -o "$body_file" -w '%{http_code}' \
    -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_ORIGIN/api/jobs/weekly-report$query"); then
    report_failure 'Missao Saber weekly report request failed'
    exit 1
  fi
  cat "$body_file"
  printf '\n'
  if [ "$status" != '200' ]; then failed=1; fi
  # O servidor só devolve estes headers quando concluiu o lote e gravou os checkpoints.
  next=$(awk 'tolower($1) == "x-next-cursor:" { gsub("\r", "", $2); print $2 }' "$headers_file")
  week=$(awk 'tolower($1) == "x-report-week:" { gsub("\r", "", $2); print $2 }' "$headers_file")
  if [ -z "$week" ] || { [ "$status" != '200' ] && [ "$status" != '503' ]; }; then
    report_failure 'Missao Saber weekly report returned an invalid batch'
    exit 1
  fi
  if [ -z "$next" ]; then break; fi
  if [ "$next" = "$cursor" ]; then
    report_failure 'Missao Saber weekly report cursor did not advance'
    exit 1
  fi
  cursor=$next
done
if [ "$failed" -ne 0 ]; then
  report_failure 'Missao Saber weekly report has pending failed deliveries'
  exit 1
fi
