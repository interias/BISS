# ADR-0002: Datenquellen im MVP – BLS 4.0 und Open Food Facts live

Status: angenommen · 28.10.2026 · Recherche: [docs/research/food-data-sources.md](../research/food-data-sources.md)

## Kontext
Bei 50–100 Lebensmitteln im Jahr lohnt keine föderierte Suche über vier Quellen. Der OFF-Dump ist mehrere GB groß. OFF-Daten stehen unter ODbL (Share-Alike), BLS 4.0 seit 16.12.2025 unter CC BY 4.0.

## Entscheidung
- **BLS 4.0** wird als Seed importiert. Ein Auszug der benötigten Spalten liegt als CSV im Repo, mit `NOTICE` (Herausgeber Max Rubner-Institut, Lizenz, Hinweis „gekürzt und umformatiert“). Der Download-Link trägt ein Session-Token, deshalb gibt es keinen Download zur Build-Zeit.
- **Open Food Facts** wird nur live per Barcode abgefragt (API v2, eigener User-Agent, höchstens 15 Abrufe pro Minute) und lokal gecacht. OFF-Daten kommen nie ins Repo. Die App zeigt den Quellenhinweis „Daten von Open Food Facts (ODbL)“.
- USDA, CIQUAL und die Schweizer Datenbank sind nicht dabei.
- Portionsgrößen: bei Markenprodukten `serving_size` aus OFF, bei generischen Lebensmitteln eine kleine eigene Tabelle mit Herkunft `estimated`.

## Folgen
- Alle durchsuchbaren Daten liegen lokal in Postgres. Die Suche läuft lokal, ohne Föderation und ohne Netz-Timeouts, auch wenn sie mehrere lokale Abfragen stellt.
- Eine OFF-Textsuche oder weitere Quellen brauchen ein neues ADR.

## Nachtrag 28.10.2026
Die erste Folge sprach von „einer einzigen Abfrage“. Gemeint war: lokal in Postgres, keine Föderation, kein Netz. Seit E2 (#10) stellt die Suche bis zu drei lokale Abfragen (Markennachschlag, gefilterter und ungefilterter Lauf). Die Entscheidung bleibt, nur der Wortlaut ist präzisiert (Entscheidung des Menschen: https://github.com/interias/BISS/issues/2#issuecomment-6466452148).
