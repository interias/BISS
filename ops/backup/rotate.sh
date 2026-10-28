#!/bin/sh
# Rotation: keeps the newest 14 backups in a directory. A backup is a timestamp; only files
# named biss-YYYYMMDD-HHMMSS.dump or .images.tar.gz count, everything else stays untouched.
#
#   sh /backup/rotate.sh <dir>
set -eu

dir="$1"
keep=14
pattern='^biss-[0-9]{8}-[0-9]{6}\.(dump|images\.tar\.gz)$'

# Timestamps sort chronologically as text; the newest come first.
ls -1 "$dir" | grep -E "$pattern" | sed -E 's/\.(dump|images\.tar\.gz)$//' | sort -ru |
    tail -n +$((keep + 1)) |
    while read -r stamp; do
        rm -f "$dir/$stamp.dump" "$dir/$stamp.images.tar.gz"
        echo "rotated out $stamp"
    done
