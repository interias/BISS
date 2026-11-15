# ADR-0013: Mahlzeit diktieren

Status: angenommen · 15.11.2026 · Auftrag des Menschen, Ansatz aus KORB

## Kontext
Ein gesprochener Satz wie „zwei Scheiben Brot mit Käse und ein Kaffee“ soll ein Gericht werden, ohne Foto und ohne Suche. SPEC 2 führte die Spracheingabe bisher unter „Nicht im MVP“. KORB löst dieselbe Aufgabe für Einkaufslisten ([KORB ADR-0005](https://github.com/interias/korb/blob/main/docs/adr/0005-llm-and-dictation.md)): Sprache zu Text macht das Handy, Text zu Einträgen das Backend mit dem Claude Agent SDK.

## Entscheidung
- **Sprache zu Text macht das Handy** über die Spracherkennung des Browsers (`SpeechRecognition`, `de-DE`, laufend mit Zwischenergebnissen, `web/lib/dictation.ts`). BISS baut keine eigene Spracherkennung. Ohne sie im Browser gibt es keinen Mikrofon-Knopf.
- **Text zu Gericht macht der Teller-Weg** ([ADR-0009](0009-plate-recognition.md)): `POST /plates/dictate` mit `{text}` (1 bis 600 Zeichen) liefert dieselbe `PlateExtraction` wie das Foto. Dieselben Modelle, dasselbe Schema, dieselben Regeln mit genau einem Rückfall auf das starke Modell, dieselbe Zuordnung über die Suche. Der `PlateExtractor` hat dafür `dictate(text, model)` mit eigenem Prompt (`DICTATE_PROMPT` in `app/plates/agent.py`).
- **Mengen:** Eine gesagte Menge geht vor (Gramm, Milliliter, Stück, Scheiben, Tassen). Ohne Angabe nimmt das Modell eine übliche Portion eines Erwachsenen; der Prompt nennt Anker dafür.
- **Ablauf:** Mikrofon im Dock links neben der Kamera startet das Zuhören, „Fertig“ im Blatt beendet es. Das Ende der Erkennung (auch nach einer Pause) schickt den Satz. Dann öffnet das Teller-Ergebnis-Sheet ohne Foto, mit Gewichte ändern, Zeilen entfernen und hinzufügen. „Eintragen“ speichert wie beim Teller ein Rezept mit einer Portion, nur ohne Produktfoto. Tap-Budget: Mikrofon + Fertig + 1 Bestätigung.
- **Abbrechen:** Schließt man das Blatt oder drückt die Zurück-Taste, bricht das Zuhören ab und nichts wird geschickt. Ein Fehler der Erkennung schickt nie; ein gesperrtes Mikrofon sagt der Toast.
- **Kein Lebensmittel im Satz:** Statt eines leeren Blatts sagt ein Toast den Hinweis des Modells oder „Kein Lebensmittel verstanden.“

## Alternativen verworfen
- **Eigene Spracherkennung im Backend** (Audio hochladen, Whisper o. Ä.): mehr Betrieb und Kosten, kein Gewinn gegenüber der Erkennung des Handys.
- **Einzeleinträge statt Gericht:** Jede Zutat als eigener Eintrag passt nicht zum Teller, der seit [ADR-0012](0012-recipe-as-food.md) als ein Gericht mit einer Portion eingetragen wird. Gleiches Ergebnis wie beim Scanner war der Auftrag.
- **Rückfall per Regel ohne Modell** wie in KORB: Ein Satz ohne Mengen lässt sich an Komma und „und“ trennen, aber nicht in Gramm schätzen. Ohne Modell gilt wie beim Foto der Fehler-Toast.

## Folgen und Risiko
- Der Satz geht an das Sprachmodell und kann Anweisungen enthalten. Er steht in `<satz>`, spitze Klammern werden entfernt, der Aufruf hat keine Werkzeuge und ein festes Schema. Daraus kann nur ein falscher Vorschlag entstehen, den das Blatt vor dem Eintragen zeigt.
- Die Spracherkennung fehlt in manchen Browsern (etwa Firefox). Dort bleibt der Knopf weg; Suche, Kamera und Chips gehen weiter.
- Ein Aufruf mit Kaltstart der CLI dauert wie beim Teller einige Sekunden; das Blatt zeigt solange „Erkenne Gericht …“ mit dem gehörten Satz.
- Einen Testsatz echter Diktate mit Schwellen gibt es noch nicht; geprüft sind Verdrahtung, Regeln und Ablauf mit dem Fake.
