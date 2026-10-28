# ADR-0006: Stack, Repo-Struktur und Werkzeuge

Status: angenommen · 28.10.2026

## Entscheidung
- **Monorepo:** `api/` (Python), `web/` (Next.js), `data/` (BLS-Seed), `docs/`, `compose.yaml` im Wurzelverzeichnis.
- **Backend:** Python 3.13, `uv`, FastAPI, SQLAlchemy 2 mit Alembic, psycopg 3, pytest, respx. Port 2478.
- **Frontend:** Next.js (App Router), `pnpm`, shadcn/ui, Tailwind, `@zxing/browser`, als PWA installierbar. Vitest und Playwright. Port 2477. Schriften: Bricolage Grotesque und Figtree.
- **Betrieb:** Docker Compose in Docker Desktop, immer in der aktuellen Version. Die Dienste heißen `db`, `api` und `web`.
- **CI:** GitHub Actions mit Lint und Tests für `api` und `web` bei jedem Pull Request.
- **Versionen:** jeweils die aktuelle stabile Version beim Anlegen, festgehalten in den Lockfiles. Neue Abhängigkeiten außerhalb dieser Liste nur nach Rückfrage.

## Folgen
- Ein `docker compose up` startet alles. Tests laufen lokal und in der CI gleich.
