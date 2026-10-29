# ADR-0010: Schnellzugriff als Vorlage

Status: angenommen · 29.10.2026 · Entscheidung des Menschen

## Kontext
Manches kommt immer zusammen: Kaffee mit einem Teelöffel Zucker und gesüßtem Mandeldrink. Bisher sind das drei Einträge mit drei Taps oder mehr. Wiederkehrendes Essen soll einen Tap kosten (SPEC 1). Seit E7 gibt es Gruppen von Einträgen mit gemeinsamer `group_id` und `group_name`, jeder mit eigenem Snapshot ([ADR-0009](0009-plate-recognition.md)).

## Entscheidung
- **Vorlage:** Ein Schnellzugriff ist eine gespeicherte Vorlage aus Name und geordneten Zutaten (Lebensmittel und Gramm). Tabellen `combo` und `combo_item`, Migration `0005`.
- **Eintrag als Gruppe:** Eintragen legt eine Gruppe an wie ein Teller. Je Zutat ein Eintrag mit eigenem Snapshot, `group_name` ist der Name des Schnellzugriffs. `POST /combos/{id}/log` nutzt dasselbe `create_group` wie `POST /entries/group`.
- **Anpassen ändert die Vorlage nicht:** Geänderte Mengen, Zutaten oder Mahlzeit gelten nur für diesen Eintrag. Die Vorlage ändert sich nur mit „Als Vorlage speichern“.
- **Platz:** Die Chips stehen vorn in der Zuletzt-Reihe des Docks, farbig abgesetzt. Ein Tap trägt ein, langes Drücken öffnet das Blatt zum Anpassen. „+ Neu“ legt einen an.
- **Anlegen aus dem Tagebuch:** Jede Gruppe ohne Schnellzugriff gleichen Namens bietet „als Schnellzugriff merken“. Das Backend kopiert Lebensmittel, Gramm und Namen (`POST /combos` mit `group_id`).
- **MCP:** `list_combos` liest, `log_combo` trägt ein, per `combo_id` oder per Name nach der Normalisierung der Suche.

## Alternativen verworfen
- **Rezept als Lebensmittel:** Ein eigenes `food` mit Zutatenliste und berechneten Werten je 100 g. Das Tagebuch zeigt dann nur eine Zeile. Zucker ändern heißt Rezept ändern. Dazu käme ein neues Konzept „Lebensmittel aus Lebensmitteln“ im Overlay.
- **Gruppe erneut eintragen, ohne Tabelle:** Die letzten Gruppen erscheinen als Chips. Es gibt keinen festen Namen und nichts zu pflegen. Nach ein paar Tagen ohne Kaffee fällt die Kombination aus der Liste.

## Folgen
- Gruppe, Snapshot-Regel und die Zeilen des Teller-Blatts werden wiederverwendet. Im Tagebuch steht ein Schnellzugriff wie ein Teller, „Gericht entfernen“ und „Rückgängig“ gelten gleich.
- Die Suche findet einen Schnellzugriff nicht, nur der Chip und MCP.
- Bei vielen Schnellzugriffen wird die Chip-Reihe lang. Eine Sortierung über `position` ist angelegt, eine Oberfläche dafür nicht.
- Eine Zutat verweist auf `food` ohne `ON DELETE`. Lebensmittel lassen sich bisher nicht löschen. Kommt das, braucht es eine Regel für Vorlagen.
