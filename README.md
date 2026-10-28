<p align="center"><img src="assets/icon.svg" width="96" alt="BISS"></p>

<h1 align="center">BISS</h1>
<p align="center"><b>B</b>arcode · <b>I</b>mage · <b>S</b>can · <b>S</b>ave</p>

Selbst gehostete Ernährungs-Erfassung für den persönlichen Gebrauch. Bekanntes Essen kostet einen Tap, ein neues Produkt höchstens zwei Bestätigungen: Barcode scannen, Nährwert-Etikett fotografieren, fertig. Die eigene Lebensmitteldatenbank wächst mit der Nutzung.

Die App zeigt nur den heutigen Tag (kcal, Eiweiß, Kohlenhydrate, Fett). Auswertungen laufen extern über die API und einen MCP-Server.

## Stack

- **Backend:** FastAPI, PostgreSQL mit pg_trgm, Suche über eigene DB, BLS 4.0 und Open Food Facts
- **Frontend:** Next.js, shadcn/ui, Tailwind als PWA, Barcode-Erkennung mit ZXing
- **Erfassung per LLM:** Nährwert-Etiketten werden per Vision-Modell ausgelesen und im Code plausibilisiert
- **Betrieb:** Docker Compose, Web auf Port 2477, API auf 2478

## Status

Phase 1: Spezifikation steht in [`docs/SPEC.md`](docs/SPEC.md), Entscheidungen in [`docs/adr/`](docs/adr/). Der Design-Prototyp liegt unter [`docs/design/prototype.html`](docs/design/prototype.html).

## Starten

```bash
cp .env.example .env   # optional, alle Werte außer dem Token haben Standardwerte
docker compose up -d --wait
```

Web läuft auf <http://localhost:2477>, die API auf <http://localhost:2478> (OpenAPI unter `/docs`, Health unter `/api/v1/health`). Beim Start der API laufen die Migrationen und, solange noch keine BLS-Lebensmittel in der Datenbank sind, der BLS-Import. Der Quellcode aus `api/` und `web/` ist in die Container gemountet. Ohne gesetzte `OFF_BASE_URL` fragt ein Scan im Entwicklungsstack das echte Open Food Facts; die Tests nutzen den erfundenen Stub aus `compose.test.yaml`.

Die Etikett-Extraktion (`POST /api/v1/labels/extract`, [ADR-0004](docs/adr/0004-llm-extraction.md)) braucht in `.env` den Token aus `claude setup-token` als `CLAUDE_CODE_OAUTH_TOKEN` oder einen `ANTHROPIC_API_KEY`. Die Modelle stehen in `LLM_MODEL_FAST` und `LLM_MODEL_STRONG`. Die Claude-Code-CLI kommt mit dem Python-Paket `claude-agent-sdk` ins Image, Node ist nicht nötig. Das Etikett-Foto wird nicht gespeichert.

## Tests

```bash
docker compose run --rm api uv run pytest        # gegen Postgres, eigene Datenbank biss_test
docker compose run --rm api uv run pytest tests/golden      # goldenes Suchtestset mit Metriken
docker compose run --rm api uv run pytest -m llm # Fixture-Etiketten gegen das echte Modell, nur mit Token
docker compose run --rm api uv run ruff check .
docker compose run --rm web pnpm test            # Vitest
docker compose run --rm web pnpm e2e             # Playwright, nur mit eigenem Projekt (siehe unten)
docker compose run --rm web pnpm lint
```

Läuft schon ein Stack mit den Ports 2477/2478, oder laufen mehrere Testläufe gleichzeitig, dann mit eigenem Projektnamen und ohne veröffentlichte Ports: `docker compose -p <name> -f compose.yaml -f compose.test.yaml run --rm web pnpm e2e` (ebenso für die anderen Befehle).

Die E2E-Tests schreiben in die Datenbank des Stacks, gegen den sie laufen; jeder Lauf legt unter anderem ein Lebensmittel „Haferkeks Dinkel“ mit neuer GTIN an und trägt es ins Tagebuch ein. Sie brauchen außerdem den OFF-Stub und den Fake-Extractor aus `compose.test.yaml`. Deshalb E2E nie gegen den eigenen Stack fahren, sondern immer mit eigenem Projektnamen und `compose.test.yaml`, und danach mit `docker compose -p <name> down -v` die Testdaten samt Volumes entfernen.

Das normale `pytest` wählt die `llm`-Tests ab, damit kein Testlauf das Kontingent des Tokens belastet; ohne Token werden sie auch mit `-m llm` übersprungen. Den Ablauf der Extraktion mit Laufzeit zeigt `docker compose run --rm --no-deps api uv run python scripts/spike_label.py tests/fixtures/labels/oat_drink.png` (ein echter Modellaufruf; `--model both --transfer both` vergleicht Modelle und Bildübergabe).

Nach Änderungen an `uv.lock` oder `pnpm-lock.yaml`: `docker compose build`, danach `docker compose up -d -V`, damit `web` nicht das alte `node_modules`-Volume weiterverwendet.

## BLS-Daten

`data/bls/bls_4_0_extract.csv` ist ein Auszug aus dem Bundeslebensmittelschlüssel (BLS) 4.0 des Max Rubner-Instituts, Lizenz [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de), gekürzt und umformatiert (Details in [`data/bls/NOTICE`](data/bls/NOTICE)). Er enthält je Lebensmittel Code, deutschen Namen und die Werte je 100 g für kcal, Eiweiß, Kohlenhydrate, Fett, Ballaststoffe, Zucker, gesättigte Fettsäuren und Salz. `data/bls/servings.csv` ergänzt geschätzte Standardportionen für etwa 30 häufige Lebensmittel.

Neu erzeugen: Die XLSX `BLS_4_0_Daten_2025_DE.xlsx` von [blsdb.de](https://www.blsdb.de) herunterladen (der Link trägt ein Session-Token, deshalb gibt es keinen automatischen Download) und das Skript mit dem Pfad aufrufen:

```bash
docker compose run --rm --no-deps -v "<ordner-mit-xlsx>:/bls:ro" -v "./data/bls:/out" \
  api uv run python -m app.importers.bls_extract /bls/BLS_4_0_Daten_2025_DE.xlsx --out /out/bls_4_0_extract.csv
```

Die XLSX selbst gehört nicht ins Repo.

## Lizenz

Code unter [MIT](LICENSE). Nährwertdaten: Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut, CC BY 4.0; Produktdaten zur Laufzeit von Open Food Facts (ODbL).
