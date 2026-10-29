# ADR-0011: Open-Food-Facts-Textsuche bei wenigen lokalen Treffern

Status: angenommen · 29.10.2026 · Entscheidung des Menschen

## Kontext
Die Suche kennt nur eigene Lebensmittel, BLS und den OFF-Cache ([ADR-0002](0002-data-sources.md)). Ein Markenprodukt, das noch nie gescannt wurde, findet sie nicht. Ohne Packung in der Hand hilft dann nur der Editor. ADR-0002 verlangt für eine OFF-Textsuche ein eigenes ADR.

Open Food Facts empfiehlt für die Volltextsuche Search-a-licious (`https://search.openfoodfacts.org/search`). Die v2-API kann keine Volltextsuche, `/cgi/search.pl` gilt als veraltet. Die Doku nennt 10 Suchanfragen pro Minute und IP, bei Missbrauch droht eine Sperre ([API-Doku](https://openfoodfacts.github.io/openfoodfacts-server/api/), abgerufen am 29.10.2026).

## Entscheidung
- **Zweiter Schritt:** Die lokale Suche bleibt unverändert schnell. Ihre Antwort trägt `off_more`, wenn sie weniger als 5 Treffer für eine Suche ab 3 Zeichen hat.
- **Eigener Endpunkt:** Dann fragt die App `GET /api/v1/foods/search/off?q=` und hängt die Treffer unter den lokalen an. Während der Abfrage steht „Suche bei Open Food Facts …“ da, darunter der Hinweis „Daten von Open Food Facts (ODbL)“.
- **Anfrage:** Search-a-licious mit `langs=de`, Filter `countries_tags:"en:germany"`, 20 Treffer und nur den Feldern, die `off.draft()` und die Kategorie brauchen. Die Suchwörter behalten nur Buchstaben, Ziffern und Leerzeichen, weil die API Lucene-Syntax liest. User-Agent wie beim Barcode, ohne persönliche Adresse.
- **Cache:** Jedes gefundene Produkt geht in `off_cache`. Eingetragen wird es wie ein gescanntes über die GTIN (`POST /entries` mit `gtin`). Danach findet es die lokale Suche selbst.
- **Keine Dubletten:** Treffer der lokalen Suche fehlen in der Antwort. Ein Produkt, dessen GTIN ein Lebensmittel hat, ist dieses Lebensmittel (SPEC 6).
- **Limit:** Höchstens 6 Suchanfragen pro Minute im Prozess, getrennt vom Barcode-Limit. Timeout 3 s.
- **Query-Cache:** Dieselbe normalisierte Suche wird 24 h aus dem Speicher beantwortet, höchstens 256 Suchen. Im Speicher statt in einer Tabelle: Es gibt einen Nutzer und einen API-Prozess ([ADR-0005](0005-no-auth-mvp.md)), die Produkte liegen ohnehin in `off_cache`.
- **Fehler:** Limit, Timeout, Fehlerstatus oder kaputte Antwort ergeben eine leere Liste mit `reason`, nie einen Fehler 500.
- **Tests:** Der OFF-Stub aus `compose.test.yaml` beantwortet auch `/search`, mit erfundenen Produkten. pytest arbeitet mit `respx`, nichts geht ins Netz.

## Folgen
- Eine Suche nach einem unbekannten Produkt kostet eine Anfrage an Open Food Facts. Ab der siebten Anfrage pro Minute bleibt die Liste leer, die App sagt „Open Food Facts ist gerade nicht erreichbar.“
- Das Ranking der OFF-Treffer ist das von Open Food Facts. Das Goldene Testset prüft weiter nur die lokale Suche.
- `GET /foods/search` antwortet jetzt mit `{hits, off_more}` statt einer Liste. MCP `search_food` bleibt bei der Liste und fragt Open Food Facts nicht.
- Daten aus Open Food Facts stehen unter ODbL. Sie liegen nur im Cache und in angelegten Lebensmitteln, nie im Repo.
- Search-a-licious ist neuer als die v2-API. Ändert sich die Antwort, liefert der Endpunkt `reason: error`, und die lokale Suche läuft weiter.
