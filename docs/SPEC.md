# BISS – Spezifikation

Stand: 28.10.2026 · Begriffe: [CONTEXT.md](../CONTEXT.md) · Entscheidungen: [docs/adr/](adr/) · Design: [docs/design/prototype.html](design/prototype.html)

## 1. Ziel und Leitprinzipien

BISS ersetzt ein FDDB-Abo für eine Person. Die eigene Lebensmitteldatenbank wächst mit der Nutzung, realistisch sind es 50–100 verschiedene Lebensmittel im Jahr.

**Kernphilosophie: Möglichst wenige Taps bis zum getrackten Eintrag.** Jede Funktion wird daran gemessen, wie schnell sie vom Öffnen der App zum gespeicherten Eintrag führt.

| Ablauf | Tap-Budget |
|---|---|
| Zuletzt-Chip | 1 |
| Suche | + 2 |
| Bekannter Barcode | Kamera + 1 |
| Neues Produkt | Kamera + Auslöser + 2 Bestätigungen |
| Teller | Kamera + Auslöser + 1 Bestätigung |

Jedes Epic belegt sein Budget per Playwright. Ein schlechteres Budget braucht eine Entscheidung des Menschen.

**Leitprinzipien:**

1. **Wenige Taps:** Jeder Ablauf hält sein Tap-Budget aus der Kernphilosophie. Wiederkehrendes Essen kostet einen Tap, ein neues Produkt höchstens zwei Bestätigungen.
2. **Nur erfassen:** Die App zeigt ausschließlich den heutigen Tag (kcal, Eiweiß, Kohlenhydrate, Fett). Es gibt keine Diagramme und keine Historie-Auswertungen.
3. **Auswertung extern:** Andere Werkzeuge lesen über die REST-API und den MCP-Server.
4. **Logik im Backend:** Der Web-Client zeigt nur an. Eine spätere Flutter-App nutzt dieselbe API ([ADR-0003](adr/0003-logic-in-backend.md)).

## 2. Funktionsumfang

| Epic | Inhalt | Ergebnis |
|---|---|---|
| **E1 Erfassen per Suche** | Compose-Stack, Schema, BLS-Import, Suche, Mengen-Sheet, Tagebuch, Tagesbilanz, Zuletzt-Chips mit Rückgängig, Einträge ändern/entfernen | Lauffähiger Prototyp mit generischen Lebensmitteln |
| **E2 Eigene Lebensmittel** | Lebensmittel-Editor (Neu und Bearbeiten), Portionen mit Herkunft, Atwater-Check, Produktfoto, Overlay, Ranking nach Nutzung, goldenes Testset | Eigene DB wächst, Suche ist verlässlich |
| **E3 Barcode** | Live-Scan mit ZXing, GTIN-14, Open Food Facts live mit Cache, Quellenhinweis | Markenprodukte per Scan |
| **E4 Etikett-Foto** | Auslösen in der Kamera, Extraktion per LLM, Validierung, Fallback-Modell, Editor vorbelegt | Neues Produkt mit zwei Bestätigungen |
| **E5 Anbindung und Betrieb** | MCP-Server, Tagesziele per API, nächtliches Backup | Auswertung extern, Daten gesichert |
| **E6 Foto-Erkennung mit echten Fotos** | Barcode aus Handyfoto robust lesen, Auslöser „Etikett“ ohne Barcode, Testsätze echter Fotos | Handyfotos funktionieren auch ohne HTTPS |
| **E7 Teller-Erkennung** | Foto eines Gerichts → Zutaten mit geschätzten Mengen, abgebildet auf eigene DB und BLS, Ergebnis-Sheet nach Prototyp | Gericht mit einem Foto und einer Bestätigung |

**Nicht im MVP** (eigene Epics, wenn gewünscht): Mahlzeiten-Kombinationen, Offline-Warteschlange, Authentifizierung, Flutter-App, USDA, Open-Food-Facts-Textsuche, Spracheingabe, Statistiken jeder Art.

## 3. Abläufe

Layout, Farben, Schriften und Abläufe folgen dem Prototyp. Die Design-Tokens aus dem Prototyp werden auf die shadcn-Variablen abgebildet, hell und dunkel.

- **Hauptscreen:**
  - Header mit Logo, „BISS“ und Datum.
  - Tagesbilanz mit segmentiertem Kalorienring und drei Makro-Balken (Ist/Soll in g).
  - Tagebuch nach Mahlzeiten.
  - Dock mit Zuletzt-Chips, Suchfeld und einem Kamera-Knopf.
- **Zuletzt-Chip:** Ein Tap trägt die Standardportion zur vorgeschlagenen Mahlzeit ein. Danach erscheint ein Toast mit „Rückgängig“ für 3 s.
- **Mengen-Sheet:**
  - Bild, Quelle, Name und Marke.
  - Mahlzeit-Chip: vorbelegt, ein Tap wechselt die Mahlzeit.
  - Gramm mit ±: Schritt 5 g bis 100 g, darüber 10 g.
  - Portions-Chips sowie kcal/E/K/F live.
  - „Eintragen · X kcal“, im Bearbeitungsmodus „Speichern“ und „Entfernen“.
- **Live-Werte:** Das Sheet berechnet kcal/E/K/F lokal mit der Formel `Wert je 100 g × Gramm / 100`. Das ist reine Anzeige. Beim Speichern rechnet das Backend verbindlich ([ADR-0003](adr/0003-logic-in-backend.md)).
- **Lebensmittel-Editor:**
  - Produktfoto (Kamera oder Galerie), Name und Marke.
  - Nährwerte je 100 g: kcal, Eiweiß, KH, Fett, Ballaststoffe; optional Zucker, gesättigte Fettsäuren, Salz.
  - Atwater-Hinweis live.
  - Portionsliste: Stern markiert den Standard, Herkunft `Packung` / `geschätzt` / `eigene`. Eine geänderte Packungs- oder geschätzte Portion wird zu `eigene`.
- **Kamera:**
  - Drei Auslöser: Barcode (automatisch), Etikett und Teller (E7).
  - Ein erkannter Barcode öffnet ohne Auslösen das Mengen-Sheet.
  - Ohne Treffer zeigt die Kamera „Etikett fotografieren“. Das Foto geht mit der GTIN an die Extraktion.
  - Der Auslöser „Etikett“ braucht keinen Barcode. Das Foto geht ohne GTIN an die Extraktion.
  - Ohne Kamera, etwa ohne HTTPS, öffnet ein Auslöser die Fotoauswahl.
  - Nach der Extraktion öffnet der Editor und dann das Mengen-Sheet.
  - Der Auslöser „Teller“ schickt das Foto an die Teller-Erkennung („Erkenne Gericht …“) und öffnet das Ergebnis-Sheet. Ohne Kamera öffnet er die Fotoauswahl.
- **Teller-Ergebnis-Sheet** (E7):
  - Foto, „Erkannt · bitte prüfen“ und der Name des Gerichts als Eingabe.
  - Zutaten mit „erkannt“ oder „vermutet“ (vom Backend, nicht aus `confidence` abgeleitet), je −/+ 10 g (mindestens 5 g) und ✕.
  - Der Hinweis „Mengen sind geschätzt. Fehlt etwas?“ und Vorschläge: die Zuletzt-Chips, die noch nicht auf dem Teller liegen. Ein Tap fügt das Lebensmittel mit seiner Standardportion als „manuell“ hinzu.
  - Eine nicht zugeordnete Zutat ist als „nicht zugeordnet“ markiert und lässt sich per Suche zuordnen oder entfernen. Solange sie offen ist, wird sie nicht eingetragen, und das Sheet sagt das.
  - Kennzahlen live nach der lokalen Formel, „Eintragen · X kcal“ und „Verwerfen“. Eingetragen wird ein Gericht (`POST /entries/group`) mit dem Toast „Rückgängig“.
- **Gericht im Tagebuch:** Die Einträge eines Gerichts stehen als eine Gruppe mit der Summe des Backends in der Mahlzeit. Die Gruppe klappt auf und zeigt ihre Einträge, deren Menge sich wie bisher ändern lässt. Die Mahlzeit gilt für das ganze Gericht. „Gericht entfernen“ löscht die Gruppe, „Rückgängig“ legt sie mit Name, Mahlzeit, Zeitpunkt und Mengen neu an.

## 4. Domänenmodell

PostgreSQL 18 ([ADR-0001](adr/0001-postgres.md)). Alle Nährwerte gelten je 100 g bzw. je 100 ml.

| Tabelle | Wesentliche Felder |
|---|---|
| `food` | `id`, `name`, `brand`, `gtin` (GTIN-14, eindeutig, nullable), `basis` (`g`/`ml`), `density` (g/ml, Standard 1,0), `kcal`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sat_fat`, `salt`, `image_path`, `source` (`own`/`bls`/`off`), `source_id`, `fetched_at`, `overridden` (Liste geänderter Felder), `name_norm` (normalisiert, Trigram-Index), `created_at`, `updated_at` |
| `food_source_data` | `food_id`, `source`, `source_id`, `payload` (jsonb, Rohdaten), `fetched_at` – Grundlage des Overlays |
| `serving` | `id`, `food_id`, `label`, `grams`, `origin` (`package`/`estimated`/`own`), `is_default` |
| `entry` | `id`, `food_id`, `grams`, `meal` (`breakfast`/`lunch`/`snack`/`dinner`), `eaten_at` (timestamptz), `day` (date), `kcal`, `protein`, `carbs`, `fat` (Snapshot beim Speichern), `group_id` (uuid, nullable) und `group_name` (nullable): die Einträge eines Tellers (Abschnitt 7a) |
| `goal` | `day` (nullable = Standard), `kcal`, `protein`, `carbs`, `fat` |
| `off_cache` | `gtin`, `payload`, `fetched_at`, `name_norm` und `brand_norm` (aus `payload` normalisiert, Trigram-Index auf `name_norm`) – Kurzzeit-Cache angezeigter Treffer, 30 Tage, durchsuchbar (Abschnitt 6) |

Regeln:

- **Tag und Mahlzeit:** Zeitzone `Europe/Berlin`. Ein Eintrag bis 04:00 Uhr zählt zum Vortag. Ohne Angabe schlägt das Backend die Mahlzeit nach Uhrzeit vor: < 10:30 Frühstück, < 14:30 Mittag, < 17:30 Snack, sonst Abend.
- **Snapshot:** Ein Eintrag speichert seine Makros beim Anlegen und beim Ändern der Menge. Spätere Korrekturen am Lebensmittel ändern vergangene Tage nicht.
- **Overlay:** Ein Update aus der Quelle überschreibt nur Felder, die nicht in `overridden` stehen. Eigene Änderungen gehen nie verloren.
- **Eintragen heißt speichern:** Ein externer Treffer wird beim ersten Eintrag dauerhaft als `food` angelegt, mit Herkunft.
- **Flüssigkeiten:** `basis = ml`. Gramm werden über `density` umgerechnet, eingetragen wird immer in Gramm.

## 5. API

REST unter `/api/v1` auf Port 2478. Das OpenAPI-Schema wird erzeugt und ist die Vorlage für spätere Clients.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/days/{date}` | Tagesbilanz, Ziele, Einträge nach Mahlzeit mit ihren Gerichten und deren Summen, `suggested_meal` |
| POST | `/entries` | Eintrag anlegen. Ohne `grams` gilt die Standardportion, ohne `meal` der Vorschlag |
| PATCH / DELETE | `/entries/{id}` | Menge oder Mahlzeit ändern, entfernen (auch für „Rückgängig“) |
| POST | `/entries/group` | Gericht eintragen: ein Eintrag je Zutat mit gemeinsamer `group_id` (E7) |
| PATCH / DELETE | `/entries/group/{id}` | Mahlzeit oder Name aller Einträge des Gerichts ändern, alle entfernen (E7) |
| GET | `/recent` | Zuletzt-Chips: Lebensmittel nach Nutzung und Aktualität, mit Standardportion |
| GET | `/foods/search?q=` | föderierte Suche (Abschnitt 6) |
| GET | `/foods/barcode/{code}` | Barcode-Kette (E3) |
| GET / POST / PATCH | `/foods`, `/foods/{id}` | Lebensmittel lesen, anlegen, ändern, inkl. Portionen |
| PUT | `/foods/{id}/image` | Produktfoto hochladen (WebP, 512 px) |
| POST | `/labels/extract` | Etikett-Foto plus optionale GTIN → Entwurf mit Validierungsergebnis (E4) |
| POST | `/plates/extract` | Teller-Foto → Gericht mit Zutaten, Mengen und Zuordnung, nichts wird eingetragen (E7) |
| GET / PUT | `/goals/default` | Standardziele (E5) |
| GET / PUT / DELETE | `/goals/{date}` | Tagesziele: lesen, setzen, entfernen; ohne Tagesziel gilt das Standardziel (E5) |

**MCP-Server** (E5, [ADR-0007](adr/0007-mcp.md)): Er liegt unter `/mcp` im API-Container und nutzt dieselben Services. Lesend sind `search_food`, `get_food`, `list_entries` und `daily_summary`, schreibend nur `log_meal`.

## 6. Suche

**Quellen:**
- Das MVP durchsucht die eigene DB, die importierten BLS-Lebensmittel und den OFF-Cache ([ADR-0002](adr/0002-data-sources.md)).
- Alle Quellen liegen in Postgres, darum läuft die Suche lokal, ohne Föderation und ohne Netz-Timeouts, auch wenn sie mehrere lokale Abfragen stellt (Markennachschlag, gefilterter und ungefilterter Lauf). Föderiert wird erst, wenn eine Live-Quelle für Text hinzukommt.

**Normalisierung**, in Python und als generierte Spalte:
- Kleinschreibung und `unaccent`.
- ä→ae, ö→oe, ü→ue, ß→ss.
- Bindestriche und Satzzeichen werden zu Leerzeichen, Mengenangaben wie `500 g` oder `1,5 l` fallen weg.

**Kandidaten:** `pg_trgm` über `name_norm` und Marke, mit `word_similarity` für Teilwörter und Tippfehler.

**Marke:**
- Ein Wort der Suche, das als Marke bekannt ist, filtert auf diese Marke.
- Ohne Treffer mit Filter fließt die Marke nur in die Gewichtung ein.

**Deduplizierung:**
- Markenprodukte gleicher GTIN werden zusammengeführt.
- Generische Lebensmittel gelten als Dublette bei Namensähnlichkeit ≥ 0,9 und kcal ± 10 %.
- Pro Gruppe gilt die Priorität eigene DB > bereits verwendet > BLS > OFF.

**Ranking:** `Score = Textähnlichkeit + Quellenpriorität + Nutzung + Vollständigkeit + Markentreffer`. Die Gewichte stehen in einer Konfiguration und werden über das goldene Testset eingestellt.
- **Nutzung** ist der stärkste Faktor: Anzahl der Einträge und Aktualität mit Halbwertszeit 30 Tage.
- **Vollständigkeit:** Die Kernnährwerte sind vorhanden.

**Barcode** (E3):
- EAN-8, EAN-13 und UPC-A werden auf GTIN-14 normalisiert (führende Nullen).
- Kette: eigene DB, dann OFF-Cache, dann OFF live (Timeout 2 s), dann „Etikett fotografieren“.

## 7. Etikett-Extraktion (E4)

[ADR-0004](adr/0004-llm-extraction.md)

**Ein- und Ausgabe:**
- Eingabe ist das Foto plus die GTIN aus dem Scan. Die GTIN liest nie das Modell.
- Die GTIN ist optional. Ohne GTIN entsteht ein Lebensmittel ohne GTIN.
- Die Ausgabe ist strukturiert nach festem JSON-Schema: `name, brand, package_size, per_100 {basis, state, energy_kj, energy_kcal, fat, saturated_fat, carbs, sugar, fiber, protein, salt}, servings [{label, amount, unit, source}], confidence, notes`.

**Prompt:** Er fängt drei typische Fehler ab: die Spalte je 100 g gegenüber je Portion, zubereitet gegenüber unzubereitet sowie g gegenüber ml.

**Validierung im Code:**
- Atwater: `4·KH + 4·Eiweiß + 9·Fett + 2·Ballaststoffe` weicht höchstens 10 % von kcal ab.
- `kJ ≈ kcal · 4,184` (± 5 %), `Zucker ≤ KH`, `gesättigte Fettsäuren ≤ Fett`.

**Modelle:**
- Ein schnelles Modell als Standard und ein stärkeres als Fallback, beide konfigurierbar.
- Bei einem Regelverstoß folgt genau ein zweiter Versuch mit dem stärkeren Modell. Bleibt der Verstoß, zeigt der Editor die Warnung. Liefert das stärkere Modell keinen brauchbaren Entwurf, bleibt der des schnellen mit seiner Warnung.
- Das Etikett-Foto wird nach der Extraktion verworfen.

## 7a. Teller-Erkennung (E7)

[ADR-0009](adr/0009-plate-recognition.md)

**Ein- und Ausgabe:**
- Eingabe ist das Foto eines Tellers. Es wird nur ausgelesen und nach der Erkennung verworfen.
- Das Modell antwortet nach festem JSON-Schema: `dish, ingredients [{name, grams, confidence}], notes`.
- `POST /plates/extract` liefert `dish`, `items`, `totals` und `notes`. Ein Item hat `food_id` (oder `null`), `name`, `grams`, `confidence`, `certainty` (`recognized`/`guessed`, in der App „erkannt“/„vermutet“, ab `confidence` 0,7 erkannt), das zugeordnete Lebensmittel, dessen Werte je 100 g und `macros` für die Menge.
- `totals` summiert die zugeordneten Items. Eingetragen wird erst nach der Bestätigung.

**Prompt:** Er verlangt eine Zutat je sichtbarem Bestandteil, deutsch und generisch benannt wie im BLS (Lebensmittel, dann Zubereitung), und die Menge in Gramm wie gegessen. Er gibt Mengenanker vor, weil Schätzungen aus Fotos zu hoch ausfallen.

**Zuordnung:**
- Jede Zutat läuft durch die Suche aus Abschnitt 6, lokal und ohne Netz.
- Der beste Treffer, der ein Lebensmittel ist, wird zugeordnet, wenn sein Score mindestens 1,6 beträgt.
- Ohne solchen Treffer bleibt die Zutat „nicht zugeordnet“: `food_id` ist `null`, Werte gibt es keine. Erfunden wird nichts.

**Regeln im Code:** Ein Entwurf verstößt gegen die Regeln, wenn er keine Zutat hat, eine Zutat ohne Namen, eine Menge ≤ 0 g oder über 1.500 g, einen Teller über 3.000 g oder eine `confidence` außerhalb von 0 bis 1.

**Modelle:** wie beim Etikett (Abschnitt 7). Das schnelle Modell liest zuerst. Bei einem Regelverstoß folgt genau ein zweiter Versuch mit dem starken. Liefert das starke keinen brauchbaren Entwurf, bleibt der des schnellen.

**Gericht:**
- `POST /entries/group` legt je Zutat einen Eintrag an. Alle Einträge teilen `group_id`, `group_name`, Mahlzeit und Zeitpunkt.
- Die Snapshot-Regel gilt je Eintrag (Abschnitt 4). Eine geänderte Menge (`PATCH /entries/{id}`) ändert nur den Snapshot dieses Eintrags.
- `PATCH /entries/group/{id}` ändert Mahlzeit oder Name aller Einträge. `DELETE /entries/group/{id}` entfernt sie, auch für „Rückgängig“.
- `/days` führt je Mahlzeit alle Einträge und dazu `groups` mit `group_id`, `group_name`, `totals` und `entry_ids`. Die Summen rechnet das Backend.

## 8. Tests

Pflicht ab E1: Jedes Epic endet mit grünen Tests und lauffähigem `docker compose up`.

- **Backend:** pytest gegen einen echten Postgres-Container mit eigener Test-Datenbank.
- **Goldenes Suchtestset** (ab E1 wachsend, Ziel ca. 30 Paare in E2): Tippfehler, Umlaut-Varianten, Markenfilter, GTIN mit und ohne führende Null, „banane“ → genau ein Treffer auf Platz 1.
  - Treffer auf Platz 1 ≥ 90 %, in den Top 5 ≥ 98 %.
  - Dublettenrate in den Top 10 = 0.
  - p95 lokal < 300 ms.
  - Die Suite schlägt fehl, wenn eine Schwelle reißt.
- **Adapter-Tests** mit OFF-Antworten in der Form echter Antworten, ohne OFF-Daten (`respx`), inklusive Timeout und Ausfall.
- **Extraktion:**
  - Validierungsregeln als Unit-Tests.
  - Etiketten-Fixtures mit erwarteten Werten, als markierter Test, der nur mit gesetztem Token läuft: erzeugte Etiketten erfundener Produkte mit bekannten Werten ([ADR-0002](adr/0002-data-sources.md)).
  - Echte Etiketten (Marker `llm` und `realdata`): je Satz ≥ 90 % der Felder in Toleranz. Energie ± 5 %, die übrigen Werte ± 0,5 g oder ± 5 %, das Größere gilt; die Basis g/ml muss stimmen.
- **Echte Fototestsätze** (Marker `realdata`, [ADR-0008](adr/0008-real-photo-fixtures.md)): Barcode-Fotos mit Ground Truth, frei lizenziert im Repo und lokal unter `BISS_REAL_FIXTURES`; je Satz ≥ 75 % richtige Ziffern und keine Fehllesung; ein EAN-8 oder UPC-A gilt erst nach Bestätigung durch einen zweiten Versuch.
- **Teller-Fotos** (Marker `llm` und `realdata`, [ADR-0009](adr/0009-plate-recognition.md)): Ground Truth mit Hauptzutaten, bei gewogenen Tellern auch kcal. Die Zuordnung läuft gegen den vollen BLS-Seed. Je Satz gelten:
  - Recall der Hauptzutaten ≥ 70 %.
  - kcal innerhalb ± 35 % bei ≥ 70 % der Teller mit kcal.
  - p95 der Zeit je Foto < 15 s.
- **Frontend:** Vitest für Komponenten. Die Kernabläufe laufen als Playwright-E2E: Zuletzt-Chip mit Rückgängig, Suche → Eintrag, Eintrag bearbeiten, Barcode-Treffer (E3), Etikett → Editor → Eintrag (E4, LLM gemockt), Etikett ohne Barcode → Editor → Eintrag (E6, LLM gemockt), Teller → Ergebnis → Eintrag (E7, LLM gemockt). Die beiden E6-Abläufe (Barcode-Foto, Etikett ohne Barcode) und der Teller-Ablauf zählen dabei ihr Tap-Budget aus Abschnitt 1: Teller = Kamera + Auslöser + Eintragen.

## 9. Betrieb

[ADR-0006](adr/0006-stack-and-tooling.md)

- **Plattform:** Docker Compose in Docker Desktop, immer aktuell gehalten. Web auf Port 2477, API auf 2478, Postgres nur intern.
- **Volumes:** `db-data` und `images`.
- **Zugang:** keine Authentifizierung, die App läuft im lokalen Netz ([ADR-0005](adr/0005-no-auth-mvp.md)). Für die Kamera braucht es HTTPS, das kommt später über Tailscale. Bis dahin läuft der Kamera-Test über `localhost`. Der Test mit echter Kamera und echter Packung aus E3 wird nachgeholt, sobald HTTPS über Tailscale steht.
- **Konfiguration** per `.env`: Token, Modellnamen, Standardziele (2.400 kcal / 160 g E / 260 g KH / 75 g F).
- **Backup** (E5): nächtlich `pg_dump` plus ein Tarball der Bilder auf ein gemountetes Verzeichnis. Die letzten 14 Sicherungen bleiben erhalten.
