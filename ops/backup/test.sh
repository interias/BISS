#!/bin/sh
# Script test of the backup, only in the test stack (compose.test.yaml):
#   docker compose -f compose.yaml -f compose.test.yaml run --rm backup sh /backup/test.sh
# Writes a backup to a temporary directory (never to BACKUP_DIR), restores it into a fresh
# database on the same server (dropped afterwards), compares the row counts of all tables
# and the files of the images volume, then rotates 16 dummy backups down to 14.
set -eu

here="$(dirname "$0")"
check_db=biss_backup_check
probe=/images/backup-test-probe.bin
work="$(mktemp -d)"

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

cleanup() {
    rm -rf "$work"
    rm -f "$probe"
    dropdb --if-exists "$check_db" || true
}
trap cleanup EXIT

# Row count of every table in a database, one line "schema.table|count", ordered by table.
counts() {
    psql -X -At -v ON_ERROR_STOP=1 -d "$1" <<'SQL'
SELECT format('SELECT %L, count(*) FROM %I.%I', table_schema || '.' || table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name
\gexec
SQL
}

# Checksums of all files below a directory, paths relative to it.
files() {
    (cd "$1" && find . -type f -exec md5sum {} + | sort -k2)
}

echo "== time zone"
[ -f "/usr/share/zoneinfo/$TZ" ] || fail "no tzdata for TZ=$TZ"
echo "TZ=$TZ, local time $(date '+%Y-%m-%d %H:%M %Z')"

echo "== backup and restore"
head -c 4096 /dev/urandom > "$probe"
counts "$PGDATABASE" > "$work/before.txt"
foods="$(grep '^public\.food|' "$work/before.txt" | cut -d'|' -f2)"
[ "${foods:-0}" -gt 0 ] || fail "table food is empty, nothing real to back up"

mkdir "$work/backups"
sh "$here/backup.sh" "$work/backups"
stamp="$(ls "$work/backups" | sed -n 's/\.dump$//p')"
[ "$(echo "$stamp" | wc -w)" -eq 1 ] || fail "expected one dump, got: $stamp"
[ -f "$work/backups/$stamp.images.tar.gz" ] || fail "no images tarball for $stamp"

dropdb --if-exists "$check_db"
createdb "$check_db"
pg_restore --exit-on-error -d "$check_db" "$work/backups/$stamp.dump"
counts "$check_db" > "$work/after.txt"

echo "table | before | after"
cut -d'|' -f2 "$work/after.txt" | paste -d'|' "$work/before.txt" - | sed 's/|/ | /g'
cmp -s "$work/before.txt" "$work/after.txt" || fail "row counts differ after the restore"

mkdir "$work/images"
tar -xzf "$work/backups/$stamp.images.tar.gz" -C "$work/images"
files /images > "$work/images-before.txt"
files "$work/images" > "$work/images-after.txt"
grep -q ' \./backup-test-probe\.bin$' "$work/images-after.txt" || fail "probe file missing in the tarball"
cmp -s "$work/images-before.txt" "$work/images-after.txt" || fail "images tarball differs from the volume"
echo "images tarball: $(wc -l < "$work/images-after.txt") files, same checksums as the volume"

echo "== rotation"
rot="$work/rotation"
mkdir "$rot"
for day in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16; do
    touch "$rot/biss-202601$day-030000.dump" "$rot/biss-202601$day-030000.images.tar.gz"
done
# Files of others and a leftover of a failed run stay untouched.
touch "$rot/notes.txt" "$rot/biss-latest.dump" "$rot/biss-20260117-030000.dump.part"
echo "before: $(ls "$rot" | grep -cE '^biss-[0-9]{8}-[0-9]{6}\.dump$') backups"
sh "$here/rotate.sh" "$rot"
kept="$(ls "$rot" | sed -n 's/^\(biss-[0-9]\{8\}-[0-9]\{6\}\)\.dump$/\1/p')"
echo "after: $(echo "$kept" | wc -l) backups"
[ "$(echo "$kept" | wc -l)" -eq 14 ] || fail "expected 14 backups after the rotation"
[ "$(echo "$kept" | head -n 1)" = biss-20260103-030000 ] || fail "the oldest two were not rotated out"
[ "$(ls "$rot" | grep -c '\.images\.tar\.gz$')" -eq 14 ] || fail "expected 14 images tarballs"
for other in notes.txt biss-latest.dump biss-20260117-030000.dump.part; do
    [ -f "$rot/$other" ] || fail "rotation removed $other"
done

echo "OK"
