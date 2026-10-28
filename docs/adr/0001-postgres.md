# ADR-0001: PostgreSQL statt SQLite

Status: angenommen · 28.10.2026

## Kontext
Der Startprompt sah SQLite mit FTS5 und RapidFuzz vor. Die Suche braucht aber Tippfehlertoleranz, Umlaut-Normalisierung und Teilwort-Treffer. Außerdem greifen API, MCP-Server und später die Fitness-App gleichzeitig zu.

## Entscheidung
Wir nutzen PostgreSQL 18 (`postgres:18-alpine`) als eigenen Compose-Dienst, mit den Erweiterungen `pg_trgm` und `unaccent`. Auf PostgreSQL 19 wechseln wir nach dessen Release (geplant für den 19.11.2026).

## Folgen
- Kandidatensuche, Ähnlichkeit und Umlaut-Normalisierung liegen in der Datenbank. RapidFuzz entfällt.
- Gleichzeitige Schreibzugriffe sind unproblematisch.
- Ein Container mehr, Backup per `pg_dump`.
- Tests brauchen einen echten Postgres. SQLite als Test-Ersatz gibt es nicht, weil `pg_trgm` fehlen würde.
