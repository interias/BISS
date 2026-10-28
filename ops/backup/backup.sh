#!/bin/sh
# One backup: pg_dump (custom format) of the database plus a tarball of the images volume,
# both named by the same timestamp; afterwards the rotation keeps the newest 14 backups.
# Connection from the libpq variables of the backup service (PGHOST, PGUSER, ...).
#
#   sh /backup/backup.sh [target dir]    (default /backups, the bind mount of BACKUP_DIR)
set -eu

target="${1:-/backups}"
images="${IMAGES_DIR:-/images}"
stamp="biss-$(date +%Y%m%d-%H%M%S)"

# Written under .part names first, so a failed run never looks like a backup.
trap 'rm -f "$target/$stamp.dump.part" "$target/$stamp.images.tar.gz.part"' EXIT

pg_dump -Fc -f "$target/$stamp.dump.part"
tar -czf "$target/$stamp.images.tar.gz.part" -C "$images" .

mv "$target/$stamp.dump.part" "$target/$stamp.dump"
mv "$target/$stamp.images.tar.gz.part" "$target/$stamp.images.tar.gz"
echo "backup $stamp written to $target"

sh "$(dirname "$0")/rotate.sh" "$target"
