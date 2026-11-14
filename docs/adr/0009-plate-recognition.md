# ADR-0009: Teller-Erkennung

Status: angenommen · 28.10.2026 · Epic: [#28](https://github.com/interias/BISS/issues/28), Paket [#29](https://github.com/interias/BISS/issues/29)

## Kontext
E7 soll ein Gericht mit einem Foto und einer Bestätigung eintragen (SPEC 1). Das Modell erkennt die Zutaten und schätzt die Mengen. Die Nährwerte kommen nicht vom Modell, sondern aus der eigenen DB und dem BLS ([ADR-0002](0002-data-sources.md)). Dafür läuft jede Zutat durch dieselbe Suche, die der Nutzer per Hand hätte (SPEC 6).

## Entscheidung
- **Vision wie beim Etikett** ([ADR-0004](0004-llm-extraction.md)): Claude Agent SDK mit denselben Modellen (`LLM_MODEL_FAST`, `LLM_MODEL_STRONG`). Das Foto geht als Base64-Image-Block über den Streaming-Input, mit `tools=[]`, `dontAsk` und `setting_sources=[]`. Arbeitsverzeichnis und `CLAUDE_CONFIG_DIR` liegen in einem frischen Temp-Verzeichnis, das danach gelöscht wird. Vorher wird das Foto im Speicher auf JPEG mit höchstens 1568 px gebracht. Das Teller-Foto wird nicht gespeichert.
- **Festes Schema** `dish, ingredients [{name, grams, confidence}], notes`, ohne weitere Felder (`app/plates/draft.py`).
- **Regelverstoß** (`app/plates/extract.py`):
  - keine Zutat, eine Zutat ohne Namen
  - eine Menge ≤ 0 g oder über 1.500 g, ein Teller über 3.000 g
  - `confidence` außerhalb von 0 bis 1

  Bei einem Verstoß folgt genau ein zweiter Versuch mit dem starken Modell. Liefert es nichts Brauchbares, bleibt der Entwurf des schnellen. Mehr als diese groben Plausibilitätsregeln lässt sich ohne Ground Truth nicht prüfen.
- **Zuordnung** (`app/plates/match.py`): Je Zutat zählt der beste Treffer der Suche, der ein Lebensmittel ist. Ein Produkt aus dem OFF-Cache ohne `food` wird übersprungen.
  - Er gilt erst ab einem **Score von 1,6**. Der Score besteht aus bis zu 3,0 Textähnlichkeit und etwa 0,1 für Quelle und Vollständigkeit.
  - In einer Probe mit rund 200 Namen gegen den vollen BLS war der beste Treffer unter 1,6 fast immer ein anderes Lebensmittel: „Seetang“ → „Seeteufel“ (1,12), „Putenspeck“ → „Putenei“ (1,21), „Edamame gekocht“ → „Eier gekocht“ (1,55), „Olive schwarz“ → „Johannisbeersaft schwarz“ (1,50). Darüber stimmte er meist.
  - Die Ausnahme sind Schreibvarianten wie „Brokkoli“ → „Broccoli“ (1,16). Deshalb schreibt der Prompt die BLS-Schreibweise vor.
  - Fehltreffer mit hohem Score („Kartoffel gebraten“ → „Quarkkeulchen (mit Kartoffeln) gebraten“, 2,29) trennt keine Schwelle. Sie sind eine Frage der Benennung und damit des Prompts.
  - Ohne Treffer bleibt die Zutat „nicht zugeordnet“, ohne Werte.
- **Sicherheit der Erkennung:** `certainty` ist `recognized` ab `confidence` 0,7, darunter `guessed`. Das ist dieselbe Grenze, die der Prompt für „geraten“ nennt.
- **Gericht:** ein Eintrag je Zutat mit gemeinsamer `group_id` (uuid) und `group_name`. Die Snapshot-Regel gilt je Eintrag. `PATCH` und `DELETE` einer Gruppe wirken auf alle ihre Einträge (Entscheidung des Menschen, 28.10.2026). Migration `0004` ergänzt nur zwei nullable Spalten und einen Index auf `group_id`.
- **Schnittstelle** `PlateExtractor` mit `AgentPlateExtractor`. Mit `PLATE_EXTRACTOR=fake` (in `compose.test.yaml`) liefert `FakePlateExtractor` einen erfundenen, festen Teller. Seine Zutatennamen sind BLS-Namen („Hähnchen Brustfilet, gegrillt“, „Reis gekocht“, „Broccoli gekocht“), also werden auf dem E2E-Stack mit vollem BLS alle zugeordnet.

## Spike (28.10.2026)
Gemessen mit `api/scripts/spike_plate.py` an 5 Fotos des Repo-Satzes, 7 Modellaufrufe.

- **Latenz** (Wanduhr je Aufruf mit Start der CLI): `claude-haiku-5-5` 5,0 / 5,3 / 6,1 / 6,1 / 7,3 s (n = 5), `claude-sonnet-5-5` 3,7 / 4,3 s (n = 2).
- **Aufrufe je Foto:** 1. Kein Entwurf verstieß gegen eine Regel, der Fallback lief also nie. Mit Fallback sind es 2, im Spike also höchstens etwa 12 s.
- **Rückstände:** Es blieben keine Temp-Verzeichnisse und kein `~/.claude` zurück.
- **Erkennung:** gut. Spaghetti Bolognese, englisches Frühstück (7 von 7 Bestandteilen) und die Nutrition5k-Teller wurden richtig zerlegt.
- **kcal mit dem ersten Prompt:** weit daneben. Zwei Ursachen:
  - Die Gramm waren 1,5- bis 3-fach zu hoch: Reis 150 statt 54 g, Kartoffeln 160 statt 96 g, Pizza 150 statt 108 g.
  - Beschreibende Namen wurden falsch zugeordnet: „Kartoffel gebraten“ → Quarkkeulchen, „Bohnen in Tomatensauce“ → Sardine in Tomatensauce, „Tempeh gebraten“ → Rührei.
  - Ergebnis: `dish_1558547205` 753 statt 291 kcal, `dish_1560798785` 741 (schnell) bzw. 593 (stark) statt 380 kcal.
- **Prompt danach:**
  - Er verlangt den schlichten Lebensmittelnamen, kein Beschreiben, und gibt BLS-Namen als Beispiele vor (`Kartoffel geschält, gebacken`, `Bohnen weiß, in Tomatensoße`, `Pizza Margherita`, `Teigwaren eifrei, gekocht` auch für Spaghetti).
  - Er nennt Mengenanker (ein Reishaufen auf einem Sechstel des Tellers etwa 60 g, ein Pizzastück 10 × 12 cm etwa 100 g, ein Röschen etwa 15 g).
  - Er sagt, dass Fotoschätzungen zu hoch ausfallen und im Zweifel die kleinere Menge gilt.
  - Am fünften Foto (`dish_1563900205`, neuer Prompt) waren es 343 statt 262 kcal (+31 %).
- **Schwellen:** Sie bleiben, wie das Epic sie gesetzt hat. Geschärft wird keine: Die Latenz hat Luft, aber der Spike rechtfertigt keine strengere kcal- oder Recall-Schwelle.

## Testsatz und Bewertung
- **Repo** (`api/tests/fixtures/real/plates/`, 4,3 MB):
  - 15 Commons-Bilder mit Hauptzutaten, wie im Bild sichtbar, ohne Mengen.
  - 5 Teller aus Nutrition5k (CC BY 4.0) mit Zutaten, Gramm und kcal aus `metadata/dish_metadata_cafe1.csv`.
  - Lizenzen in `NOTICE`; Nachtrag zu [ADR-0008](0008-real-photo-fixtures.md).
- **Lokal** (`$BISS_REAL_FIXTURES/plates/`): 10 weitere Nutrition5k-Teller.
- **Hauptzutat bei Nutrition5k:** mindestens 10 % der Masse des Tellers; Öl und Dressing zählen nicht, weil sie im Bild kein eigener Bestandteil sind. Bei Commons ist jeder deutlich sichtbare, nicht nur garnierende Bestandteil eine Hauptzutat. Was nur die Beschreibung nennt, zählt nicht: zum Beispiel die gelben Würfel der Poke Bowl oder die weißen Streifen der Buddha Bowl.
- **Gefunden** ist eine Hauptzutat, wenn einer ihrer Namen am Wortanfang steht oder, ab drei Buchstaben, am Wortende. Gesucht wird im Namen der erkannten Zutat oder im zugeordneten Lebensmittel, normalisiert wie in der Suche: „Brot“ in „Roggenbrot“, „Ei“ nicht in „Haferbrei“ (`api/tests/plate_scoring.py`).
- **Schwellen je Satz** (`api/tests/test_plates_realdata.py`):
  - Recall der Hauptzutaten über alle Teller ≥ 70 %.
  - kcal (Summe der zugeordneten Items) innerhalb ± 35 % bei ≥ 70 % der Teller mit kcal.
  - p95 der Zeit je Foto (Erkennung samt Fallback und Zuordnung) < 15 s.

## Abnahmelauf (28.10.2026)
`pytest -m "llm and realdata" tests/test_plates_realdata.py -s`, ein Aufruf je Foto (kein Fallback nötig):

| Lauf | Satz | Recall | kcal ± 35 % | p95 | Aufrufe |
|---|---|---|---|---|---|
| 1 | Repo (20) | 67/72 = 93,1 % | 3/5 = 60 % ✗ | 8,6 s | 20 |
| 1 | Lokal (10) | 24/28 = 85,7 % | 7/10 = 70 % | 8,3 s | 10 |
| 2 | Repo (20) | 70/72 = 97,2 % | 5/5 = 100 % | 8,5 s | 20 |
| 2 | Lokal (10) | 23/28 = 82,1 % | 7/10 = 70 % | 7,7 s | 10 |

- **Lauf 1** verfehlte die kcal-Schwelle im Repo-Satz knapp. Beide Fehlschläge (+55 %, +59 %) kamen vom Prompt-Beispiel „Bratkartoffeln“. Die Suche ordnete es „Bratkartoffeln mit Ei“ zu (198 kcal je 100 g), auf dem Teller lagen aber gebackene Kartoffelstücke.
- **Lauf 2** lief nach genau einer Korrektur. Das Beispiel heißt jetzt „Kartoffel geschält, gebacken“ (auch für geröstete Kartoffelstücke). Alle Schwellen sind erreicht.
- **Lokale Ausreißer:** Zwei Salate mit Hähnchen und Oliven erkannte das Modell als Tofu und Bohnen (−89 %, −65 %). Bei einem Teller lag das Hähnchen bei −39 %.
- Insgesamt 67 Modellaufrufe: Spike 7, Lauf 1 30, Lauf 2 30.
- **Verworfen am 13.11.2026:** eine Prompt-Regel, die für Gebratenes und angemachten Salat 5 bis 10 g Öl oder Butter als vermutete Zutat verlangt. Das Modell setzte das Öl fast überall dazu. Im Repo-Satz lagen damit nur 2/5 und 3/5 Teller innerhalb ± 35 % (zwei Läufe), ohne die Regel am selben Tag 5/5. Die gewogenen Teller werden ohnehin eher zu hoch geschätzt.

## Nachtrag (14.11.2026): größerer Testsatz, Vergleich, Auswahlschritt
Auftrag des Menschen: Die Erkennung soll vor allem die richtigen Lebensmittel finden, Mengen lassen sich nachstellen. Wartezeit zählt weniger.

- **Testsatz:** 25 weitere Commons-Bilder (Getränke und Frühstück, warme und kalte Gerichte, Süßes, schwere Fälle wie Soße über dem Schnitzel oder ein fast leerer Teller), zusammen 45 Teller. Jede Ground Truth kann mit `also` nennen, was zusätzlich auf dem Teller sein darf (Soße, Öl, Kräuter).
- **Benchmark** (`tests/test_plates_bench.py`): Modelle und Varianten nebeneinander, jedes Foto mehrfach. Er misst, was das Modell nennt („seen“), ob das zugeordnete Lebensmittel den Namen der Zutat trägt („logged“), was erfunden wurde und was kein Lebensmittel fand. Die Spanne über die Durchläufe zeigt den Zufall.
- **Auswahlschritt:** Die Suche geht nach Buchstaben und nimmt für „Falafel gebraten“ den „Trüffel gebraten“. Trägt der beste Treffer nicht genau den Namen der Zutat, bekommt das Modell Kandidaten der Suche (ganzer Name und erstes Wort) und wählt einen oder keinen. Ein zweiter Aufruf ohne Foto. Erfinden kann das Modell weiterhin nichts; ohne brauchbare Antwort gilt der Treffer der Suche.
- **Vergleich** (45 Fotos, 2 Durchläufe, drei Modelle gleichzeitig; die Zeiten sind deshalb nicht belastbar):

  | Modell | seen (Spanne) | logged | logged ohne Auswahlschritt | erfunden je Teller | ohne Antwort |
  |---|---|---|---|---|---|
  | `claude-haiku-5-5` | 95,1 % (95–95) | 91,4 % | 89,1 % | 0,3 | 2 von 90 |
  | `claude-sonnet-5-5` | 97,7 % (97–98) | 94,4 % | 90,1 % | 0,0 | 1 von 90 |
  | `claude-opus-5-5` | 96,1 % (94–98) | 93,1 % | 89,5 % | 0,1 | 2 von 90 |

- **Entscheidung:** Sonnet liest zuerst, Opus ist das starke Modell für den zweiten Versuch. Sonnet lag in jeder Spalte vorn oder gleichauf. Der Auswahlschritt bringt bei jedem Modell 2 bis 4 Punkte.
- **Offen:** Zusammengesetzte Namen finden oft kein Lebensmittel („Aprikosenkonfitüre“, „Haferbrei mit Milch“, „Speiseeis Vanille“). Drei Hauptzutaten verfehlt jedes Modell; dort ist eher das Foto oder die Ground Truth uneindeutig.

## Folgen
- Die kcal eines Tellers hängen an zwei Schätzungen, der Menge und der Zuordnung. Die App zeigt deshalb jede Zutat mit „erkannt“ oder „vermutet“, mit ihrem Lebensmittel und mit ±. Vor dem Eintragen lässt sich alles korrigieren.
- Der Fake-Teller setzt voraus, dass der E2E-Stack den vollen BLS lädt. Der Abnahmelauf prüft das vorab ohne Modellaufruf.
- `api/app/plates/agent.py` wiederholt den Aufbau von `api/app/labels/agent.py`. Ein gemeinsamer Baustein wäre eine eigene Umbauentscheidung.
