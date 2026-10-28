# ADR-0003: Alle Fachlogik im Backend

Status: angenommen · 28.10.2026

## Kontext
Später soll eine Flutter-App dieselben Abläufe bieten. Doppelte Logik in zwei Clients driftet auseinander.

## Entscheidung
Das Backend entscheidet:
- Mahlzeit-Vorschlag, Tagesgrenze (04:00 Uhr), Standardportion
- Makro-Berechnung des Eintrags, Suche und Ranking
- Barcode-Normalisierung, Validierung der Nährwerte (Atwater) und Herkunftswechsel einer Portion

Der Web-Client zeigt an und schickt Eingaben. Erlaubt ist eine lokale Vorschau `Wert je 100 g × Gramm / 100` im Mengen-Sheet und im Editor, damit die Zahlen live mitlaufen. Gespeichert wird immer das Ergebnis des Backends.

## Folgen
- Die API liefert fertige Werte, zum Beispiel `suggested_meal` und `atwater` im Validierungsergebnis.
- Ein Dart-Client wird aus dem OpenAPI-Schema generiert und braucht keine Fachlogik.
