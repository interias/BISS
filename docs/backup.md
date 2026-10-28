# Backup und Wiederherstellung

Der Compose-Dienst `backup` sichert jede Nacht um 03:00 Uhr (Europe/Berlin) die Datenbank und die Produktfotos ([SPEC 9](SPEC.md#9-betrieb)). Er nutzt dasselbe Image wie `db` (`postgres:18-alpine`), damit `pg_dump` und `pg_restore` zur Serverversion passen, und bekommt nur die Datenbank-Verbindung, keinen Token und keinen API-Schlüssel.

## Sicherungen

- **Ziel:** das Verzeichnis `BACKUP_DIR` aus `.env`, ohne Angabe `./backups` im Repo (von Git ignoriert). Im Container liegt es unter `/backups`.
- **Eine Sicherung** besteht aus zwei Dateien mit demselben Zeitstempel:
  - `biss-JJJJMMTT-HHMMSS.dump`: `pg_dump` im Custom-Format
  - `biss-JJJJMMTT-HHMMSS.images.tar.gz`: Tarball des Volumes `images`
- **Rotation:** Nach jeder erfolgreichen Sicherung bleiben die neuesten 14. Gelöscht werden nur Dateien nach diesem Namensmuster, andere Dateien im Verzeichnis bleiben unberührt.
- **Protokoll:** `docker compose logs backup`.
- **Sofort sichern:** `docker compose exec backup sh /backup/backup.sh`.

Die Skripte liegen unter [`ops/backup/`](../ops/backup/). Der Skripttest läuft nur im Testbett mit eigenem Projektnamen, siehe README:

```bash
docker compose -f compose.yaml -f compose.test.yaml run --rm backup sh /backup/test.sh
```

## Wiederherstellung

Die Wiederherstellung ersetzt die Datenbank und die Fotos vollständig durch den Stand der Sicherung. `<stempel>` steht für den Zeitstempel der gewählten Sicherung, z. B. `biss-20261028-030000` (Liste: `docker compose run --rm --no-deps backup ls /backups`). Die Befehle laufen im Repo-Verzeichnis, in PowerShell wie in Bash. In Git Bash vorher `export MSYS_NO_PATHCONV=1` setzen, sonst werden die Container-Pfade umgeschrieben.

1. **Datenbank zurückspielen.** App anhalten, Datenbank leeren und den Dump einspielen:

   ```bash
   docker compose stop web api backup
   docker compose run --rm --no-deps backup sh -c 'dropdb "$PGDATABASE" && createdb "$PGDATABASE" && pg_restore --exit-on-error -d "$PGDATABASE" /backups/<stempel>.dump'
   ```

2. **Fotos zurückspielen.** Das Volume `images` leeren und den Tarball entpacken (im Dienst ist es sonst nur lesbar gemountet):

   ```bash
   docker compose run --rm --no-deps -v images:/images backup sh -c 'find /images -mindepth 1 -delete && tar -xzf /backups/<stempel>.images.tar.gz -C /images'
   ```

3. **Stack wieder starten.** Die API prüft beim Start die Migrationen, danach läuft alles wie vor der Sicherung:

   ```bash
   docker compose up -d --wait
   ```
