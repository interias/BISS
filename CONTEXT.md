# Glossar

Fachbegriffe von BISS. Im Code gilt der englische Bezeichner.

| Begriff | Code | Bedeutung |
|---|---|---|
| Lebensmittel | `food` | Ein Produkt oder generisches Lebensmittel mit Nährwerten je 100 g bzw. 100 ml |
| Quelle | `source` | Herkunft eines Lebensmittels: `own` (selbst angelegt), `bls` (Bundeslebensmittelschlüssel), `off` (Open Food Facts) |
| Overlay | `overridden` | Eigene Änderungen an Feldern eines Quell-Lebensmittels. Updates aus der Quelle überschreiben sie nie |
| Portion | `serving` | Benannte Menge in Gramm, z. B. „1 Becher = 200 g“ |
| Herkunft der Portion | `origin` | `package` (Packung), `estimated` (geschätzt), `own` (eigene). Eine geänderte `package`- oder `estimated`-Portion wird zu `own` |
| Standardportion | `is_default` | Die Portion, die ein Zuletzt-Chip einträgt |
| Eintrag | `entry` | Gegessene Menge eines Lebensmittels mit Mahlzeit, Zeitpunkt und Makro-Snapshot |
| Mahlzeit | `meal` | `breakfast`, `lunch`, `snack`, `dinner` (Frühstück, Mittag, Snack, Abend). Das Backend setzt sie nach Uhrzeit; die App zeigt sie nicht |
| Tagebuch | `rows` | Einträge und Gerichte eines Tages als eine Liste, neueste zuerst |
| Tag | `day` | Kalendertag in Europe/Berlin. Ein Eintrag bis 04:00 Uhr zählt zum Vortag |
| Tagesbilanz | `day summary` | Summe von kcal, Eiweiß, KH und Fett eines Tages gegen die Ziele |
| Tagesziel | `goal` | Sollwerte eines Tages; ohne eigenen Wert gilt das Standardziel |
| Zuletzt-Chip | `recent` | Lebensmittel im Dock, ein Tap trägt die Standardportion ein |
| Etikett | `label` | Foto der Nährwerttabelle. Es wird nur ausgelesen und nicht gespeichert |
| Teller | `plate` | Foto eines Gerichts. Es wird nur ausgelesen und nicht gespeichert |
| Schnellzugriff | `combo` | Gespeicherte Vorlage aus Name und Zutaten mit Gramm. Eintragen legt ein Gericht mit ihrem Namen an, die Vorlage bleibt |
| Gericht | `group` | Die Einträge eines Tellers oder Schnellzugriffs mit gemeinsamer `group_id` und `group_name`; jeder Eintrag behält seinen eigenen Snapshot |
| Kategorie | `category` | Symbolgruppe eines Lebensmittels, z. B. Obst oder Wurst. Ein Lebensmittel ohne Foto zeigt ihr Symbol |
| Produktfoto | `image` | Separates Foto des Produkts, wird gespeichert und angezeigt |
| GTIN | `gtin` | Barcode, normalisiert auf 14 Stellen mit führenden Nullen |

_Avoid_: „Rezept“ (nicht im MVP; ein Schnellzugriff ist kein Lebensmittel), „Kombi“ (es heißt Schnellzugriff), „Statistik“ (nicht Teil der App).
