#!/bin/sh
# Main process of the backup service: busybox crond with one job, daily at 03:00 in TZ
# (Europe/Berlin). The job output goes to the container log (docker compose logs backup).
set -eu

echo "0 3 * * * sh /backup/backup.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root
exec crond -f -l 8 -c /etc/crontabs
