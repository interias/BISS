# ADR-0012: Rezept als abgeleitetes Lebensmittel

Status: angenommen · 14.11.2026 · Auftrag des Menschen, Ausgestaltung von Claude vorgeschlagen

## Kontext
Selbst Gekochtes und Gebackenes entsteht aus rohen Zutaten und wird in Portionen gegessen: Skyrbrötchen aus Mehl, Skyr, Ei, Zucker, Salz und Backpulver, fünf Stück, zwei davon heute. Beim Backen, Braten und in der Heißluftfritteuse verliert das Gericht Wasser. 100 g des fertigen Brötchens tragen dann mehr als 100 g Teig. Eine Suppe behält ihr Gewicht etwa.

Der Schnellzugriff ([ADR-0010](0010-combo-template.md)) passt dafür nicht: Er trägt jedes Mal alle Zutaten in voller Menge ein und kennt weder Portionen noch ein Fertiggewicht. ADR-0010 hat „Rezept als Lebensmittel“ für den Schnellzugriff verworfen, weil dort jede Zutat im Tagebuch sichtbar und einzeln änderbar bleiben soll (ein Teelöffel Zucker weniger im Kaffee). Bei einem gebackenen Brötchen gibt es das nicht: Gegessen wird ein Anteil des fertigen Ganzen.

## Entscheidung
- **Ein Rezept hat ein eigenes Lebensmittel.** Tabellen `recipe` und `recipe_item`, Migration `0007`. `recipe.food_id` zeigt auf ein Lebensmittel der Quelle `own`, Kategorie Gerichte.
- **Werte aus den Zutaten:** Die Zutaten (Lebensmittel und Gramm, roh gewogen) ergeben die Werte des ganzen Gerichts. Geteilt durch das Fertiggewicht sind es die Werte je 100 g des Lebensmittels. Einen Wert, der einer Zutat fehlt (Ballaststoffe, Zucker, gesättigte Fettsäuren, Salz), kennt auch das Gericht nicht.
- **Fertiggewicht ist optional:** `cooked_grams` ist das gewogene fertige Gericht. Ohne Angabe gilt die Summe der Zutaten.
- **Portionen:** Fertiggewicht geteilt durch `portions` ist die Standardportion „1 Portion“ des Lebensmittels.
- **Eintragen wie jedes Lebensmittel:** Suche, Vorhersage, Mengen-Sheet, Portions-Chip („2 × 1 Portion“) und Snapshot gelten unverändert. Ein Eintrag ist eine Zeile im Tagebuch.
- **Ändern rechnet neu:** Jede Änderung am Rezept berechnet das Lebensmittel und seine Portion neu. Eingetragene Einträge behalten ihren Snapshot.
- **Beschreibung und Foto:** `description` ist freier Text zur Zubereitung. Das Foto ist das Produktfoto des Lebensmittels.
- **Oberfläche:** Ein Kochbuch-Symbol im Dock öffnet „Meine Rezepte“ mit allen Rezepten und „+ Neues Rezept“ (zuerst ein Link im Blatt „+ Neu“, am 14.11.2026 ersetzt). „Bearbeiten“ im Mengen-Sheet öffnet bei einem Rezept das Rezept-Blatt statt des Lebensmittel-Editors.

## Alternativen verworfen
- **Schnellzugriff mit Anteil:** Eintragen als Gruppe aller Zutaten, jede mit ihrem Anteil. Das Tagebuch zeigt dann sechs rohe Zutaten für zwei Brötchen, das Fertiggewicht hat keinen Ort, und „180 g vom Fertigen“ lässt sich nicht eintragen.
- **Nur ein eigenes Lebensmittel von Hand:** Die Werte je 100 g müsste man selbst ausrechnen und bei jeder Änderung der Zutaten neu.

## Folgen
- Ändern sich die Werte einer Zutat später, bleibt das Rezept, wie es war, bis es wieder gespeichert wird.
- Ein Rezept kann Zutat eines anderen Rezepts sein, aber nicht seiner selbst.
- Rezepte lassen sich wie Lebensmittel nicht löschen.
- Wird ein Rezept mit anderem Ergebnis erneut gebacken, gilt das zuletzt eingetragene Fertiggewicht für neue Einträge.
- Der Lebensmittel-Editor kann ein Rezept-Lebensmittel über die API weiter ändern; die App führt dorthin nicht mehr. Das nächste Speichern des Rezepts überschreibt solche Änderungen.
