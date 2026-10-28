---
forge: github
api: https://api.github.com/repos/interias/BISS
token_env: GH_TOKEN
push_remote: origin
issue_form: tickets
ready_label: ready-for-agent
skip_labels: [needs-triage, needs-info, wontfix]
epic_label: epic
dependency_source: [header, body]
base_branch: main
main_branch: main
glossary: CONTEXT.md
adr_dir: docs/adr
read_all_adrs: true
must_read: [docs/SPEC.md]
test_commands:
  api: docker compose -f compose.yaml -f compose.test.yaml run --rm api uv run pytest
  web: docker compose -f compose.yaml -f compose.test.yaml run --rm web pnpm test
  e2e: docker compose -f compose.yaml -f compose.test.yaml run --rm web pnpm e2e
lint_commands:
  api: docker compose -f compose.yaml -f compose.test.yaml run --rm api uv run ruff check .
  web: docker compose -f compose.yaml -f compose.test.yaml run --rm web pnpm lint
writers: [api/app/importers, api/alembic]
env_files: [.env]
test_isolation_env: BISS_PACKAGE
window: 2
exclusive_paths: [api/uv.lock, api/pyproject.toml, web/pnpm-lock.yaml, web/package.json, api/alembic/versions, compose.yaml]
commit_style: plain
commit_language: en
plan_artifact: publish
---

# Projektregeln BISS

- Modus `tickets`: Das Epic hat sieben Abschnitte als Kontext; die Kopfzeile `> **Reihenfolge:** nach #<nr> · Kinder: #a, #b` nennt Vorgänger-Epic und Kinder. Harte Kanten zwischen Kindern stehen im Kind unter `## Blocked by`. `ready-for-agent` tragen Epics und Kinder.
- Fachbegriffe aus `CONTEXT.md`; Code, Kommentare und Commits auf Englisch.
- Keine Funktion, die nicht in `docs/SPEC.md` steht, vor allem keine Statistiken in der App.
- Neue Abhängigkeiten außerhalb von ADR-0006 nur nach Rückfrage am Vorab-Tor.
- Jedes Paket endet mit grünen Tests und lauffähigem `docker compose up`.
- Testisolation: `Up` setzt in der kopierten `.env` `BISS_PACKAGE=<nr>` und `COMPOSE_PROJECT_NAME=biss-<nr>`. Das Testbett eines Pakets ist sein eigenes Compose-Projekt `biss-<nr>` mit eigenem `db`-Container und eigenen Volumes; die Testbefehle laufen im Paket-Worktree, Compose liest den Projektnamen aus der `.env` (zusätzlich `-p biss-<nr>` erlaubt), immer mit `compose.test.yaml`, also ohne veröffentlichte Ports.
- `window: 2`, weil jedes Paket ein eigenes Compose-Projekt hat (Entscheidung des Menschen in #2). Den vollen Stack auf 2477/2478 und die Abnahme fährt nur der Orchestrator im Slot, nacheinander.
- GitHub-Token: `GH_TOKEN` aus `gh auth token`.
