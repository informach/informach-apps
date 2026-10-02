FROM alpine/curl@sha256:d7720f8cffb47e7a80d01fb2c1b38562fab0e436948537e9b77dc312d29d12d6
COPY apps/missao-saber/scripts/weekly-report-cron.sh /app/weekly-report-cron.sh
ENTRYPOINT []
CMD ["sh", "/app/weekly-report-cron.sh"]
