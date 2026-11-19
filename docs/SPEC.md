# BISS – Spezifikation

Stand: 19.11.2026 · Begriffe: [CONTEXT.md](../CONTEXT.md) · Entscheidungen: [docs/adr/](adr/) · Design: [docs/design/prototype.html](design/prototype.html), Rückblick, Statistik und Einstellungen: [docs/design/rueckblick.html](design/rueckblick.html)

## 1. Ziel und Leitprinzipien

BISS ersetzt ein FDDB-Abo für eine Person. Die eigene Lebensmitteldatenbank wächst mit der Nutzung, realistisch sind es 50–100 verschiedene Lebensmittel im Jahr.

Der Leitsatz und seine Regeln stehen in [AGENTS.md](../AGENTS.md). Diese Tabelle hält die Tap-Budgets dazu fest:

| Ablauf | Tap-Budget |
|---|---|
| Zuletzt-Chip | 1 |
| Schnellzugriff | 1 |
| Suche | + 2 |
| Schnellzugriff aus der leeren Suche | Suche + 1 |
| Rezept aus „Meine Rezepte“ | Reiter Rezepte + 2 |
| Rezept aus Text oder Link anlegen | Reiter Rezepte + 3 |
| Bekannter Barcode | Kamera + 1 |
| Neues Produkt | Kamera + Auslöser + 2 Bestätigungen |
| Teller | Kamera + Auslöser + 1 Bestätigung |
| Mahlzeit diktieren | Mikrofon + Fertig + 1 Bestätigung |
| Zutat zu einem Gericht ergänzen | aufklappen + 3 |
| Gestern ansehen | 1 |
| Anderer Tag im selben Monat | Datum + 1 |
| Zurück zu heute | 1 |
| Statistik | 1 |
| Einstellungen | 1 |

Die Kamera ist aus jedem Reiter mit einem Tap erreichbar. Auf einem früheren Tag kostet Eintragen einen Tap mehr („+ Nachtragen“), danach gelten die Budgets oben.

Jede Änderung an der Oberfläche folgt den Regeln für ein einheitliches Interface in [docs/design/einheitlichkeit.md](design/einheitlichkeit.md).

**Weitere Leitprinzipien:**

1. **Erfassen zuerst:** Der Reiter Heute dient dem Erfassen. Rückblick und Statistik ([ADR-0015](adr/0015-review-and-stats.md)) kosten das Erfassen keinen Tap und urteilen nicht: keine Serien, Noten, Abzeichen, Erinnerungen und kein Rot bei Überschreitung.
2. **Tiefere Auswertung extern:** Andere Werkzeuge lesen über die REST-API und den MCP-Server.
3. **Logik im Backend:** Der Web-Client zeigt nur an. Eine spätere Flutter-App nutzt dieselbe API ([ADR-0003](adr/0003-logic-in-backend.md)).

## 2. Funktionsumfang

| Epic | Inhalt | Ergebnis |
|---|---|---|
| **E1 Erfassen per Suche** | Compose-Stack, Schema, BLS-Import, Suche, Mengen-Sheet, Tagebuch, Tagesbilanz, Zuletzt-Chips mit Rückgängig, Einträge ändern/entfernen | Lauffähiger Prototyp mit generischen Lebensmitteln |
| **E2 Eigene Lebensmittel** | Lebensmittel-Editor (Neu und Bearbeiten), Portionen mit Herkunft, Atwater-Check, Produktfoto, Overlay, Ranking nach Nutzung, goldenes Testset | Eigene DB wächst, Suche ist verlässlich |
| **E3 Barcode** | Live-Scan mit ZXing (oder dem `BarcodeDetector` des Browsers, [ADR-0008](adr/0008-real-photo-fixtures.md)), GTIN-14, Open Food Facts live mit Cache, Quellenhinweis | Markenprodukte per Scan |
| **E4 Etikett-Foto** | Auslösen in der Kamera, Extraktion per LLM, Validierung, Fallback-Modell, Editor vorbelegt | Neues Produkt mit zwei Bestätigungen |
| **E5 Anbindung und Betrieb** | MCP-Server, Tagesziele per API, nächtliches Backup | Auswertung extern, Daten gesichert |
| **E6 Foto-Erkennung mit echten Fotos** | Barcode aus Handyfoto robust lesen, Auslöser „Etikett“ ohne Barcode, Testsätze echter Fotos | Handyfotos funktionieren auch ohne HTTPS |
| **E7 Teller-Erkennung** | Foto eines Gerichts → Zutaten mit geschätzten Mengen, abgebildet auf eigene DB und BLS, Ergebnis-Sheet nach Prototyp | Gericht mit einem Foto und einer Bestätigung |
| **E8 Schnellzugriff** | Gespeicherte Kombinationen als Vorlage, Chip im Dock, Anpassen per langem Drücken, „als Schnellzugriff merken“ im Tagebuch, MCP `log_combo` ([ADR-0010](adr/0010-combo-template.md)) | Feste Kombinationen mit einem Tap |

| **E9 Rückblick und Statistik** | Navigationsleiste, Tag wechseln mit Pfeil und Kalender, Nachtragen auf frühere Tage, Statistik für Woche und Monat, Einstellungen mit Zielen ab heute und Toleranz ([ADR-0015](adr/0015-review-and-stats.md)) | Gestern mit einem Tap, „Wie war die Woche?“ ohne externes Werkzeug |

Dazu kommen **Rezepte** ([ADR-0012](adr/0012-recipe-as-food.md)): selbst Gekochtes und Gebackenes aus rohen Zutaten, in Portionen eingetragen, das **Diktat** ([ADR-0013](adr/0013-dictation.md)): eine gesprochene Mahlzeit wird ein Gericht wie ein Teller, und der **Rezept-Import** ([ADR-0014](adr/0014-recipe-import.md)): ein eingefügter Rezepttext oder Link füllt das Rezept-Blatt.

**Nicht im MVP** (eigene Epics, wenn gewünscht): Offline-Warteschlange, Authentifizierung, Flutter-App, USDA, Körpergewicht und Energiebilanz.

## 3. Abläufe

Layout, Farben, Schriften und Abläufe folgen dem Prototyp. Die Design-Tokens aus dem Prototyp werden auf die shadcn-Variablen abgebildet, hell und dunkel.

- **Hauptscreen:**
  - Header mit Logo, „BISS“ und Datum („Heute · Do 19. Nov“, „Gestern · Mi 18. Nov“, sonst „Di 10. Nov“). Links vom Datum ein Pfeil zurück, auf einem früheren Tag rechts einer vor.
  - Tagesbilanz mit segmentiertem Kalorienring und drei Makro-Balken (Ist/Soll in g), gegen das Ziel, das an diesem Tag galt.
  - Tagebuch als eine Liste, neueste zuerst. Jede Zeile zeigt ihre Uhrzeit. Mahlzeiten zeigt die App nicht.
  - Dock mit Schnellzugriff- und Zuletzt-Chips, Suchfeld und Mikrofon (nur mit Spracherkennung im Browser). Die Kamera steht in der Navigationsleiste.
  - Die Zurück-Taste des Handys schließt ein offenes Blatt oder die Kamera und verlässt die App nicht.
  - Auf dem Handy ist die App am Bildschirm festgemacht: Die Seite selbst scrollt nie, nur das Tagebuch, die Statistik und die Blätter. Auf heute bleibt das Dock mit der Suche immer unten erreichbar.
- **Navigationsleiste** ([ADR-0015](adr/0015-review-and-stats.md)): unten unter dem Dock, mit den Reitern Heute, Rezepte, Statistik und Einstellungen. In der Mitte steht erhaben die Kamera, aus jedem Reiter mit einem Tap. Sie trägt immer für heute ein und wechselt dafür zu Heute. Der aktive Reiter hat eine Pille in der Akzentfarbe. Ein Tipp auf Heute, während Heute offen ist, springt zum heutigen Tag.
- **Anderer Tag:**
  - Der Pfeil zurück geht einen Tag zurück, der Pfeil vor einen vor, nie über heute hinaus.
  - Ein Tipp aufs Datum öffnet das Blatt „Tag wählen“: ein Monat mit −/+ und je Tag einem kleinen Ring (Anteil am kcal-Ziel des Tages), ein Tag ohne Einträge gestrichelt, heute in der Akzentfarbe, der gewählte Tag gefüllt. Darunter „Heute“ und „Gestern“. Ein Tipp auf einen Tag öffnet ihn und schließt das Blatt. Künftige Tage sind gesperrt.
  - Auf einem früheren Tag ersetzt eine Leiste mit „Zurück zu heute“ und „+ Nachtragen“ das Dock. „+ Nachtragen“ zeigt das Dock mit dem Band „Trägt ein für <Tag> · Fertig“. Jeder Eintrag dann bekommt diesen Tag (`eaten_at` an dem Tag, Uhrzeit wie bei einem Eintrag jetzt), und der Toast sagt „<Name> eingetragen für <Tag> · X kcal“.
  - Die App öffnet und lädt immer mit heute. Kommt sie nach dem Tageswechsel in den Vordergrund, springt sie auf den neuen Tag, außer ein Blatt ist offen.
- **Statistik** (Reiter, [ADR-0015](adr/0015-review-and-stats.md)):
  - Oben „Woche | Monat“ und darunter der Zeitraum mit −/+: „Letzte Woche · 9. – 15. Nov“, „Diese Woche“, „KW 45“; „Letzter Monat · Oktober 2026“, „Dieser Monat“. Beim Öffnen gilt die letzte Woche. Vor den ersten Eintrag und über heute hinaus geht es nicht.
  - Antwort zuerst: der Schnitt je Tag groß („2.276 kcal je Tag“), darunter „124 unter deinem Ziel von 2.400“ und der Vergleich zum Zeitraum davor („67 kcal weniger als in der Woche davor“). Gelten im Zeitraum verschiedene Ziele, steht „deinem Ziel (im Schnitt 2.450)“. Klein darunter „Aus 6 von 7 Tagen. An 2 Tagen im Zielbereich (±10 %).“
  - **Kalorien je Tag:** Balken mit gestrichelter Ziellinie, die beim Wechsel des Ziels springt. Ein Tag ohne Einträge zeigt einen Strich auf der Grundlinie, der laufende Tag einen gestrichelten Umriss. Im Monat sind die Balken heller und eine Linie zeigt den Schnitt der letzten 7 erfassten Tage. Ein Tipp auf einen Balken zeigt darunter Tag, kcal und „E K F“ mit „Öffnen“; „Öffnen“ wechselt zu Heute auf diesen Tag.
  - **Nährstoffe im Schnitt:** Eiweiß, Kohlenhydrate, Fett als Balken bis 130 % des Ziels mit Marke beim Ziel, je „An 5 von 7 Tagen im Zielbereich“.
  - **Erfasste Tage:** in der Woche sieben Ringe, im Monat der Kalender mit Ringen. Ein Tipp öffnet den Tag. Es gibt keinen Serienzähler.
  - **Nach Wochentag** (nur im Monat): Schnitt je Wochentag als Balken.
  - **Nach Tageszeit:** Anteil der kcal morgens, mittags, nachmittags und abends, mit den Grenzen der Mahlzeit-Vorschläge (Abschnitt 4). Einträge zwischen 00:00 und 04:00 Uhr gehören zum Vortag und zählen als abends.
  - **Am häufigsten:** die fünf Lebensmittel und Gerichte mit den meisten Einträgen, je Anzahl und kcal.
  - Über dem Ziel wird nichts rot. Die Farben sind die der Tagesbilanz.
- **Einstellungen** (Reiter, [ADR-0015](adr/0015-review-and-stats.md)):
  - **Tagesziele:** Kalorien, Eiweiß und Fett sind Zahlenfelder wie im Lebensmittel-Editor (Zifferntastatur, ganze Zahlen über 0). Kohlenhydrate sind der Rest und stehen als berechnete Zeile darunter: `(kcal − 4·Eiweiß − 9·Fett) ÷ 4`. So ergeben die Nährwerte immer genau das Kalorienziel. Ändert man die Kalorien, ziehen die Kohlenhydrate live mit. Eine Leiste in den drei Farben zeigt die Anteile an den Kalorien („E 27 % · K 45 % · F 28 %“).
  - Ergeben Eiweiß und Fett schon mehr als das Kalorienziel, steht „Eiweiß und Fett ergeben schon X kcal.“ in der Warnfarbe, und „Ab heute übernehmen“ bleibt grau.
  - Ändert man einen Wert, erscheint unten fest „Gilt ab heute, <Tag>. Frühere Tage behalten ihre Ziele.“ mit „Verwerfen“ und „Ab heute übernehmen“. Sonst steht dort „Gilt seit <Tag>“. „Ab heute übernehmen“ speichert und sagt „Neue Ziele gelten ab heute“ mit „Rückgängig“.
  - Die Vorschau rechnet lokal und ist reine Anzeige. Verbindlich rechnet das Backend beim Speichern ([ADR-0003](adr/0003-logic-in-backend.md)).
  - **Toleranz:** ±5, ±10, ±15 oder ±20 %, Standard ±10 %. Ein Tipp gilt sofort, für alle Tage.
  - **Bisherige Ziele:** alle Standardziele, das neueste zuerst, je mit „seit <Tag>“.
- **Chips im Dock:**
  - „+ Schnellzugriff“ (ein Plus mit dem Zeichen der Schnellzugriff-Chips, den zwei gestapelten Quadraten) steht fest vorn und braucht nie Scrollen.
  - Dahinter stehen Schnellzugriffe und Zuletzt-Chips in einer Reihe, das zuletzt verwendete zuerst. Was gerade eingetragen wurde, steht also gleich neben den festen Knöpfen.
  - Verwendet heißt: der neueste Eintrag des Lebensmittels, beim Schnellzugriff die neueste Gruppe mit seinem Namen (`group_name`, Abschnitt 4), jeweils nach `eaten_at`. Ein Schnellzugriff steht vor den Lebensmitteln, die mit ihm eingetragen wurden.
  - Ein Schnellzugriff, der noch nie eingetragen wurde, steht hinter allen verwendeten Chips, in der Reihenfolge des Anlegens.
  - Jeder Chip hat zwei Zeilen: oben der Name, unten klein „<Gramm> g · <kcal> kcal“.
  - Lange Namen enden nach etwa 14 Zeichen mit „…“. Der volle Name steht im Tooltip und für Screenreader.
- **Zuletzt-Chip:** Ein Tap trägt die Standardportion ein. Danach erscheint der Toast „<Name> eingetragen · X kcal“ mit „Rückgängig“ für 3 s.
- **Schnellzugriff** (E8, [ADR-0010](adr/0010-combo-template.md)):
  - Die Chips stehen in der Zuletzt-Reihe zwischen den Zuletzt-Chips (siehe „Chips im Dock“), farbig abgesetzt mit zwei gestapelten Quadraten. Unten stehen die Summe der Gramm und der kcal.
  - Ein Tap trägt alle Zutaten als Gruppe ein. Der Toast „<Name> eingetragen · X kcal“ bietet „Rückgängig“ für 3 s und entfernt dann die ganze Gruppe.
  - Langes Drücken (500 ms) oder das Kontextmenü öffnet das Blatt zum Anpassen: Zutaten mit −/+ und getippten Gramm (1–1.500 g), „tauschen“, ✕, „+ Zutat suchen“ und Kennzahlen live.
  - „Eintragen · X kcal“ trägt die angepassten Zutaten ein. Die Vorlage bleibt. Nur „Als Vorlage speichern“ ändert Name und Zutaten der Vorlage.
  - „Löschen“ fragt im Blatt nach, erst „Ja, löschen“ entfernt die Vorlage. Eingetragene Gruppen bleiben.
  - „+ Schnellzugriff“ öffnet dasselbe Blatt mit Name und Zutaten aus dem Feld „Zutat suchen“, wie im Rezept-Blatt und ohne Vorschlags-Chips. In der Suche führen Scrim, Escape und Zurück-Taste zurück zum Schnellzugriff. „Speichern“ legt die Vorlage an.
- **Leere Suche** (der Wirt, Abschnitt 6): Solange nichts getippt ist, zeigt die Suche zwei Gruppen.
  - „Jetzt wahrscheinlich“: bis zu sechs Tipps für den nächsten Eintrag. Die Gruppe entfällt, solange sie nur die Liste darunter wiederholen würde.
  - „Zuletzt“: die bis zu 100 zuletzt verwendeten Lebensmittel und Schnellzugriffe, das neueste zuerst. Diese Reihenfolge ist fest, damit jedes an der erwarteten Stelle steht. Ein Rezept zählt schon ab dem Speichern, steht also oben, bevor es je eingetragen wurde.
  - Ein Tap auf ein Lebensmittel öffnet das Mengen-Sheet wie bei einem Treffer. Das Tap-Budget der Suche gilt unverändert, das Tippen entfällt.
  - Ein Schnellzugriff steht mit seiner Summe in beiden Gruppen. Ein Tap trägt ihn ein wie sein Chip im Dock, mit dem Toast „Rückgängig“, und schließt die Suche. Wo die Suche eine Zutat wählt (Teller, Schnellzugriff, Gericht), fehlen die Schnellzugriffe.
- **Rezept** ([ADR-0012](adr/0012-recipe-as-food.md)):
  - Der Reiter Rezepte zeigt „Meine Rezepte“: alle Rezepte, das zuletzt gespeicherte zuerst, je mit Foto, Portionen und kcal je Portion. Ein Tap öffnet das Mengen-Sheet des Rezepts, „+ Neues Rezept“ das Rezept-Blatt.
  - Ein Rezept steht überall in der Akzentfarbe: in der Suche mit der Marke „Rezept“, als Chip im Dock und im Tagebuch (`recipe` am Lebensmittel).
- **Farben der Namen:** Ein eigenes Rezept steht in der Akzentfarbe (Magenta). Ein gescanntes Produkt, also eines mit Barcode aus Scan oder Etikett-Foto (`scanned`), steht in Türkis. Alles andere bleibt neutral. Das gilt in Suche, Dock-Chips, Tagebuch, im Titel des Mengen-Sheets und auf den Zutaten-Vorschlägen; ein Rezept geht vor.
- **Einheitliches Aussehen** (Klassen in `web/lib/styles.ts`):
  - Ein Foto erscheint überall, wo das Lebensmittel gelistet ist: Tagebuch, Suche, Dock-Chip, Mengen-Sheet, Rezeptliste (`image_path` an jedem Lebensmittel).
  - Abschnitts- und Blatt-Kennzeilen stehen klein, in Großbuchstaben und gesperrt. Blatt-Titel sind 21 px groß.
  - **KI-Zeichen:** Jeder Schritt, der ein Sprachmodell fragt, trägt drei Glitzersterne (`AiMark`): die Auslöser „Etikett“ und „Teller“, „Etikett fotografieren“, das Mikrofon im Dock, „Aus Text oder Link“ und „Übernehmen“.
  - „Etwas Neues hinzufügen“ ist überall eine gestrichelte Pille in der Akzentfarbe („+ Schnellzugriff“, „+ Zutat“, „+ Neues Rezept“, „Neu anlegen“). Rezept, Schnellzugriff und Teller fügen Zutaten über ein Feld „Zutat suchen“ an, gestaltet wie die Suche im Dock.
  - Die graue Zeile eines Suchtreffers nennt die Herkunft in einem Wort und die Bezugsgröße: „BLS · je 100 g“ oder „Harry · je 100 g“.
  - **Eiweiß, Kohlenhydrate, Fett** stehen überall in dieser Reihenfolge und in denselben drei Farben (`MacroLine`, `DOTS`). In jeder Liste steht rechts unter den kcal dieselbe Kurzzeile „E 11 K 4 F 0“, für dieselbe Menge wie die kcal: Suchtreffer (je 100 g), Schnellzugriff in der Suche (Summe), Tagebuch-Eintrag und Gericht (eingetragene Menge), „Meine Rezepte“ (je Portion). Tagesbilanz und Blätter zeigen die drei Werte groß mit Farbe und Wort.
  - Kleine Knöpfe in Zutatenzeilen (−, +, ✕, „tauschen“) reagieren auf etwa 40 px, ohne größer auszusehen.
  - Lange Namen brechen um, bevorzugt nach einem Schrägstrich, und überdecken nichts. Ein Hauptknopf, der noch nicht geht, ist grau.
  - Rezept-Blatt: Foto, Name, Zutaten roh gewogen (je Zutat bis 10.000 g, hinzugefügt über das Feld „Zutat suchen“, ohne Vorschlags-Chips), Portionen mit −/+, optionales Fertiggewicht in g und Zubereitung als freier Text. Darunter stehen Gewicht und Kennzahlen einer Portion live.
  - Ohne Fertiggewicht gilt das Gewicht der Zutaten, etwa bei Suppe. Nach dem Backen oder Braten wird gewogen und nachgetragen.
  - „Meine Rezepte“ zeigt neben „+ Neues Rezept“ die Pille „Aus Text oder Link“ ([ADR-0014](adr/0014-recipe-import.md)). Sie öffnet das Rezept-Blatt mit einem Textfeld und „Übernehmen“ oben. Das Ergebnis füllt leere Felder (Name, Zubereitung, Portionen) und fügt die Zutaten an. Eine Zutat ohne passendes Lebensmittel steht rot als „nicht zugeordnet“ mit „suchen“ und ✕ in der Liste; „suchen“ öffnet die Suche mit ihrem Namen, die Gramm bleiben. Solange eine offen ist, sagt das Blatt „Nicht zugeordnete Zutaten zählen nicht mit.“ Ein Link, der nicht lädt, sagt, den Text einzufügen.
  - Fertiggewicht liest deutsch geschriebene Zahlen („1.200“ = 1200 g, „450,5“). Ein Wert, der kein Gewicht über 0 bis 50.000 g ist, steht rot unter dem Feld, und „Speichern“ bleibt grau.
  - **Entwurf:** Was im Blatt steht, merkt sich der Browser, solange es vom gespeicherten Rezept abweicht (ohne Foto). Geht das Blatt aus Versehen zu (Scrim, Escape, Zurück-Taste, Neuladen), öffnet es wieder so, mit „Entwurf von vorhin · Neu anfangen“ (beim Bearbeiten „· Verwerfen“). Unten links steht bei einem neuen Rezept „Verwerfen“, beim Bearbeiten „Abbrechen“. Diese Knöpfe und „Speichern“ löschen den Entwurf, sonst bleibt er. Ein ungespeichertes neues Rezept steht in „Meine Rezepte“ oben als „Nicht gespeichert“ mit „Weiter“; ein bestehendes mit offenem Entwurf trägt „Entwurf offen“. In der Zutatensuche führen Scrim, Escape und Zurück-Taste zurück zum Rezept, nicht aus dem Blatt.
  - „Speichern“ legt das Rezept an und öffnet das Mengen-Sheet seines Lebensmittels. Dort zählt der Chip „1 Portion“ wie jede Portion („2 × 1 Portion“).
  - Ein Rezept steht in Suche und leerer Suche wie jedes Lebensmittel, abgesetzt in der Akzentfarbe mit der Marke „Rezept“ (`recipe` am Treffer). „Bearbeiten“ im Mengen-Sheet öffnet bei einem Rezept das Rezept-Blatt.
- **Mengen-Sheet:**
  - Bild, Quelle, Name und Marke.
  - Gramm mit ±. Ein Tap auf die Zahl öffnet die Zifferntastatur, mindestens 1 g.
  - Ein neuer Eintrag beginnt mit der zuletzt eingetragenen Menge des Lebensmittels, sonst mit der Standardportion.
  - Portions-Chips: Ein Tap setzt die Portion, jeder weitere Tap legt eine dazu („2 × 1 Ei (M) · 110 g“). Ab zwei Portionen steht ein „−“ vor dem Chip und nimmt eine weg.
  - „zuletzt“-Chips: die bis zu drei zuletzt eingetragenen Mengen, die keine Portion sind. Es zählen nur Einzeleinträge, keine Zutaten eines Tellers oder Schnellzugriffs.
  - kcal/E/K/F live.
  - „Eintragen · X kcal“, im Bearbeitungsmodus „Speichern“ und „Entfernen“.
  - Zurück aus „Bearbeiten“ rechnet „Speichern“ den Eintrag mit den geänderten Werten neu, auch bei gleicher Menge. Nach einem geänderten Rezept behält die Menge ihre Anzahl Portionen.
- **Schritte von − und +** (Mengen-, Teller- und Schnellzugriff-Blatt):
  - 1 g unter 20 g, 5 g von 20 bis 100 g, 10 g ab 100 g.
  - + springt zum nächsten Wert des Rasters, − zum vorigen. Hin und zurück ergibt wieder den Ausgangswert, kein Wert wird übersprungen.
  - Nie unter 1 g. Teller und Schnellzugriff enden bei 1.500 g, ein einzelner Eintrag hat keine Obergrenze.
- **Symbole:** Ein Lebensmittel ohne Foto zeigt das Symbol seiner Kategorie statt eines leeren Tellers, in Suche, Chips, Blättern und Tagebuch. Ohne Kategorie zeigt es das Symbol „Sonstiges“. Ein Gericht im Tagebuch zeigt das Symbol „Gerichte“. Jede Kategorie hat ihre eigene Farbe für ihr Symbol, im hellen und dunklen Modus; „Sonstiges“ bleibt grau.
- **Live-Werte:** Das Sheet berechnet kcal/E/K/F lokal mit der Formel `Wert je 100 g × Gramm / 100`. Das ist reine Anzeige. Beim Speichern rechnet das Backend verbindlich ([ADR-0003](adr/0003-logic-in-backend.md)).
- **Lebensmittel-Editor:**
  - Produktfoto (Kamera oder Galerie), Name und Marke.
  - Symbol: optional eine der Kategorien, ohne Wahl „Sonstiges“.
  - Nährwerte je 100 g: kcal, Eiweiß, KH, Fett, Ballaststoffe; optional Zucker, gesättigte Fettsäuren, Salz.
  - Atwater-Hinweis live.
  - Portionsliste: Stern markiert den Standard, Herkunft `Packung` / `geschätzt` / `eigene`. Eine geänderte Packungs- oder geschätzte Portion wird zu `eigene`.
  - „Speichern“ (neu: „Speichern & eintragen“) und „Abbrechen“ (aus dem Etikett: „Verwerfen“) stehen fest am unteren Rand des Blatts, die Felder scrollen darüber. Auch nach einem langen Etikett braucht Speichern kein Scrollen.
- **Toast nach dem Eintragen:** Jeder neue Eintrag sagt „<Name> eingetragen · X kcal“, die kcal des Eintrags gerundet, mit „Rückgängig“ für 3 s. Das gilt für Zuletzt-Chip, Suche, Barcode, Etikett, Teller, Diktat, Rezept, eine Zutat zu einem Gericht und den Schnellzugriff (dort die Summe der Gruppe).
- **Fehler:** Schlägt ein Aufruf fehl, sagt ein Toast „Das hat nicht geklappt. Verbindung prüfen.“. Ist das Backend beim Öffnen nicht erreichbar, steht das auf dem Hauptscreen mit „Erneut versuchen“. Kommt die App wieder in den Vordergrund, lädt sie den Tag neu. Liegt auf dem Server inzwischen ein neuer Stand, lädt sie sich selbst neu, außer ein Blatt oder die Kamera ist offen.
- **Kamera:**
  - Drei Auslöser: Barcode (automatisch), Etikett und Teller (E7).
  - Ein erkannter Barcode öffnet ohne Auslösen das Mengen-Sheet.
  - Ohne Treffer zeigt die Kamera „Etikett fotografieren“. Das Foto geht mit der GTIN an die Extraktion.
  - Die Kamera sagt, warum es keinen Treffer gibt (Abschnitt 6): unbekannt, bei Open Food Facts ohne Nährwerte (mit Name) oder Open Food Facts antwortet nicht (mit „Noch einmal versuchen“).
  - Das Live-Bild wird mit 1920 × 1080 angefragt, damit das Standbild für Etikett und Teller scharf genug ist.
  - Der Auslöser „Etikett“ braucht keinen Barcode. Das Foto geht ohne GTIN an die Extraktion.
  - Ohne Kamera, etwa ohne HTTPS, öffnet ein Auslöser die Fotoauswahl.
  - Nach der Extraktion öffnet der Editor und dann das Mengen-Sheet. Das Etikett-Foto ist im Editor als Produktfoto vorbelegt und wird mit dem Lebensmittel gespeichert; ein anderes Foto ersetzt es.
  - Der Auslöser „Teller“ schickt das Foto an die Teller-Erkennung („Erkenne Gericht …“) und öffnet das Ergebnis-Sheet. Ohne Kamera öffnet er die Fotoauswahl.
  - **Ladebildschirm:** Solange das Backend ein Etikett oder einen Teller liest (oder im Blatt einen diktierten Satz), verdeckt er das Kamerabild: eine von vier Animationen, je Foto zufällig, und ein kurzer Spruch, der alle 2 s wechselt („Zähle Erbsen …“). Die Statuszeile darunter sagt weiter, was läuft.
- **Teller-Ergebnis-Sheet** (E7):
  - Foto, „Erkannt · bitte prüfen“ und der Name des Gerichts als Eingabe.
  - Zutaten mit „erkannt“ oder „vermutet“ (vom Backend, nicht aus `confidence` abgeleitet), je −/+ (mindestens 1 g) und ✕.
  - **Gesamtgewicht:** Unter den Zutaten steht ihre Summe als Eingabe. Ein gewogener Wert verteilt sich live im Verhältnis der Mengen auf alle Zutaten, auch auf nicht zugeordnete, in ganzen Gramm und mit genau dieser Summe; Kennzahlen und „Eintragen“ ziehen mit. Nur die Grenzen je Zutat (1 bis 1.500 g) können die Summe abweichen lassen. Ändert man danach eine Zutat, zeigt das Feld wieder die neue Summe.
  - Der Hinweis „Mengen sind geschätzt. Fehlt etwas?“ und das Feld „Zutat suchen“ wie im Rezept-Blatt. Die Wahl kommt mit ihrer Standardportion als „manuell“ dazu. In der Suche führen Scrim, Escape und Zurück-Taste zurück zum Gericht.
  - Eine nicht zugeordnete Zutat ist als „nicht zugeordnet“ markiert und lässt sich per Suche zuordnen oder entfernen. Solange sie offen ist, wird sie nicht eingetragen, und das Sheet sagt das.
  - Kennzahlen live nach der lokalen Formel, „Eintragen · X kcal“ und „Verwerfen“.
  - „Eintragen“ speichert den Teller als eigenes Lebensmittel und trägt es ein (Abschnitt 7a): ein Rezept mit einer Portion, den zugeordneten Zutaten und dem Tellerfoto als Produktfoto. Im Tagebuch steht eine Zeile. Ein Tap öffnet das Mengen-Sheet: Die Anzahl ändert der Chip „1 Portion“ („2 × 1 Portion“), „Bearbeiten“ öffnet das Rezept-Blatt mit den Zutaten. „Rückgängig“ im Toast entfernt den Eintrag, das Lebensmittel bleibt.
- **Mahlzeit diktieren** ([ADR-0013](adr/0013-dictation.md)):
  - Das Mikrofon am rechten Ende der Suchzeile öffnet das Blatt „Ich höre zu“ mit dem gehörten Text in großer Schrift und „Fertig“. Ohne Spracherkennung im Browser fehlt der Knopf.
  - „Fertig“ oder eine Pause beendet das Zuhören. Der Satz geht an `POST /plates/dictate`. Solange zeigt das Blatt „Erkenne Gericht …“ mit dem Ladebildschirm der Kamera (eine der vier Animationen, eigene Sprüche wie „Wiege jedes Wort …“) und darunter klein den gehörten Satz.
  - Danach öffnet das Teller-Ergebnis-Sheet ohne Foto und gilt unverändert: Gewichte, Gesamtgewicht, ✕, „tauschen“, „Zutat suchen“, „Eintragen“ als Rezept mit einer Portion, nur ohne Produktfoto.
  - Schließen oder die Zurück-Taste bricht ab, ohne etwas zu schicken. Ein gesperrtes Mikrofon sagt der Toast „Das Mikrofon ist aus. Erlaube es im Browser.“, ein Satz ohne Lebensmittel den Hinweis des Modells.
- **Gericht im Tagebuch:** Die Einträge eines Gerichts (Schnellzugriff oder `POST /entries/group`) stehen als eine Gruppe mit der Summe des Backends in der Liste, zur Uhrzeit des Gerichts. Die Gruppe klappt auf und zeigt ihre Einträge. Ein Tap auf einen Eintrag öffnet das Mengen-Sheet zum Ändern oder Entfernen. „+ Zutat“ öffnet die Suche (nur Lebensmittel) und trägt die Wahl als weiteren Eintrag des Gerichts ein, mit dessen Name, Mahlzeit und Zeitpunkt (`POST /entries` mit `group_id`). „Gericht entfernen“ löscht die Gruppe, „Rückgängig“ legt sie mit Name, Mahlzeit, Zeitpunkt und Mengen neu an.
- **Als Schnellzugriff merken:** Jede Gruppe im Tagebuch, zu der es keinen Schnellzugriff gleichen Namens gibt, zeigt „als Schnellzugriff merken“. Ein Tap legt die Vorlage mit Name, Lebensmitteln und Gramm der Gruppe an.

## 4. Domänenmodell

PostgreSQL 18 ([ADR-0001](adr/0001-postgres.md)). Alle Nährwerte gelten je 100 g bzw. je 100 ml.

| Tabelle | Wesentliche Felder |
|---|---|
| `food` | `id`, `name`, `brand`, `gtin` (GTIN-14, eindeutig, nullable), `basis` (`g`/`ml`), `density` (g/ml, Standard 1,0), `kcal`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sat_fat`, `salt`, `image_path`, `category` (Symbolgruppe, nullable), `source` (`own`/`bls`/`off`), `source_id`, `fetched_at`, `overridden` (Liste geänderter Felder), `name_norm` (normalisiert, Trigram-Index), `created_at`, `updated_at` |
| `food_source_data` | `food_id`, `source`, `source_id`, `payload` (jsonb, Rohdaten), `fetched_at` – Grundlage des Overlays |
| `serving` | `id`, `food_id`, `label`, `grams`, `origin` (`package`/`estimated`/`own`), `is_default` |
| `entry` | `id`, `food_id`, `grams`, `meal` (`breakfast`/`lunch`/`snack`/`dinner`), `eaten_at` (timestamptz), `day` (date), `kcal`, `protein`, `carbs`, `fat` (Snapshot beim Speichern), `group_id` (uuid, nullable) und `group_name` (nullable): die Einträge eines Gerichts |
| `goal` | `day` (Tagesziel eines Tages) oder `valid_from` (Standardziel ab diesem Tag), genau eines gesetzt, `kcal`, `protein`, `carbs`, `fat` |
| `setting` | eine Zeile: `tolerance` (Anteil, 0,05 bis 0,20, Standard 0,10) |
| `combo` | `id`, `name`, `position` (Reihenfolge im Dock), `created_at`, `updated_at` – Vorlage eines Schnellzugriffs (E8) |
| `combo_item` | `id`, `combo_id` (löscht mit), `food_id`, `grams` (> 0 und ≤ 1.500), `position` – Zutaten der Vorlage in Reihenfolge |
| `recipe` | `id`, `food_id` (eindeutig), `description`, `portions` (1–100), `cooked_grams` (optional, ≤ 50.000) – Rezept; sein Lebensmittel trägt die Werte je 100 g des fertigen Gerichts ([ADR-0012](adr/0012-recipe-as-food.md)) |
| `recipe_item` | `id`, `recipe_id` (löscht mit), `food_id`, `grams` (> 0 und ≤ 10.000), `position` – rohe Zutaten in Reihenfolge |
| `off_cache` | `gtin`, `payload`, `fetched_at`, `name_norm` und `brand_norm` (aus `payload` normalisiert, Trigram-Index auf `name_norm`) – Kurzzeit-Cache angezeigter Treffer, 30 Tage, durchsuchbar (Abschnitt 6) |

Regeln:

- **Tag und Mahlzeit:** Zeitzone `Europe/Berlin`. Ein Eintrag bis 04:00 Uhr zählt zum Vortag. Ohne Angabe schlägt das Backend die Mahlzeit nach Uhrzeit vor: < 10:30 Frühstück, < 14:30 Mittag, < 17:30 Snack, sonst Abend.
- **Ziel eines Tages:** sein Tagesziel, sonst das Standardziel mit dem neuesten `valid_from` bis zu diesem Tag, sonst die Standardziele aus `.env`. Eine Änderung in den Einstellungen schreibt ein Standardziel mit `valid_from` = heute, ein Standardziel von heute wird ersetzt. Vorgegeben sind dabei kcal, Eiweiß und Fett; das Backend speichert die Kohlenhydrate als `(kcal − 4·Eiweiß − 9·Fett) ÷ 4` ungerundet und lehnt einen Wert unter 0 ab (422). Tagesziele der Fitness-App bleiben, wie sie gesendet werden. Frühere Tage ändern sich nie. Die Migration gibt einem bestehenden Standardziel den ersten Tag mit Eintrag als `valid_from`.
- **Zielbereich:** Ein Wert liegt darin, wenn `|Ist − Ziel| ≤ tolerance × Ziel`, je Wert für sich und mit dem Ziel des Tages.
- **Statistik:** Es zählen abgeschlossene Tage (vor heute) mit mindestens einem Eintrag. Schnitte sind Summen geteilt durch diese Tage, ebenso das Ziel im Schnitt. Eine Woche läuft von Montag bis Sonntag, ein Monat ist ein Kalendermonat. Verglichen wird mit dem Zeitraum gleicher Art davor, wenn er erfasste Tage hat.
- **Mahlzeit nur als Datum:** `meal` bleibt in Tabelle, API und MCP. Die App wählt und zeigt sie nicht, das Backend füllt sie nach Uhrzeit.
- **Snapshot:** Ein Eintrag speichert seine Makros beim Anlegen und beim Ändern der Menge. Spätere Korrekturen am Lebensmittel ändern vergangene Tage nicht. Nur der Eintrag, aus dessen Mengen-Sheet das Lebensmittel oder Rezept bearbeitet wurde, wird mit „Speichern“ neu berechnet.
- **Overlay:** Ein Update aus der Quelle überschreibt nur Felder, die nicht in `overridden` stehen. Eigene Änderungen gehen nie verloren.
- **Rezept:** Werte je 100 g = Summe der Zutaten ÷ Fertiggewicht × 100, auf 0,1 gerundet. Fertiggewicht ist `cooked_grams`, sonst die Summe der Zutaten. Eine Zutat mit Basis ml zählt mit ihrem Volumen. Fehlt einer Zutat ein Zusatzwert (Ballaststoffe, Zucker, gesättigte Fettsäuren, Salz), bleibt er beim Gericht leer. „1 Portion“ = Fertiggewicht ÷ `portions`. `GET /foods/{id}` nennt bei einem Rezept-Lebensmittel `recipe_id`.
- **Geschätzte Portionen:** `data/bls/servings.csv` hält typische Portionen für Grundlebensmittel, die erste je Lebensmittel ist der Standard. Jeder API-Start ergänzt neue Zeilen. Ein BLS-Lebensmittel, dessen Portionen im Editor geändert wurden (`servings` in `overridden`) oder das eine eigene Portion hat, bekommt keine dazu.
- **Eintragen heißt speichern:** Ein externer Treffer wird beim ersten Eintrag dauerhaft als `food` angelegt, mit Herkunft.
- **Kategorie:** Eine feste Liste von 16 Symbolgruppen (`bread`, `grains`, `fruit`, `vegetables`, `legumes`, `potatoes`, `dairy`, `eggs`, `meat`, `sausage`, `fish`, `fats`, `sweets`, `drinks`, `dishes`, `other`).
  - BLS: aus dem ersten Buchstaben des BLS-Codes (Hauptgruppe), bei E und K aus den ersten zwei Zeichen (Eier, Pilze).
  - Open Food Facts: aus `categories_tags` mit einer kleinen Zuordnung, sonst `other`.
  - Eigene Lebensmittel: aus dem Editor, ohne Wahl leer.
  - Die Zuordnung liegt im Backend (`app/domain/category.py`, [ADR-0003](adr/0003-logic-in-backend.md)). Eine geänderte Kategorie eines BLS- oder OFF-Lebensmittels steht im Overlay.
- **Flüssigkeiten:** `basis = ml`. Gramm werden über `density` umgerechnet, eingetragen wird immer in Gramm.
- **Schnellzugriff:** Eine Vorlage ist kein Eintrag. Eintragen legt eine Gruppe an, mit `group_name` = Name der Vorlage und eigenem Snapshot je Eintrag. Angepasste Zutaten ändern die Vorlage nicht.

## 5. API

REST unter `/api/v1` auf Port 2478. Das OpenAPI-Schema wird erzeugt und ist die Vorlage für spätere Clients.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/days/{date}` | Tagesbilanz, Ziele, `rows` (das Tagebuch: Einträge und Gerichte neueste zuerst, Gerichte mit Summe), dazu `meals` (Einträge nach Mahlzeit für andere Clients) und `suggested_meal` |
| POST | `/entries` | Eintrag anlegen. Ohne `grams` gilt die Standardportion, ohne `meal` der Vorschlag. Mit `group_id` wird er eine weitere Zutat dieses Gerichts |
| PATCH / DELETE | `/entries/{id}` | Menge oder Mahlzeit ändern, entfernen (auch für „Rückgängig“) |
| POST | `/entries/group` | Gericht eintragen: ein Eintrag je Zutat mit gemeinsamer `group_id` |
| PATCH / DELETE | `/entries/group/{id}` | Mahlzeit oder Name aller Einträge des Gerichts ändern, alle entfernen |
| GET | `/recent` | Zuletzt-Chips: Lebensmittel nach Nutzung und Aktualität, mit Standardportion |
| GET | `/chips` | Chip-Reihe des Dock: alle Schnellzugriffe und die Lebensmittel von `/recent`, das zuletzt verwendete zuerst, nie eingetragene Schnellzugriffe am Ende; je Eintrag `food` oder `combo` |
| GET | `/combos` | Schnellzugriffe nach `position`, je Zutat Lebensmittel, Gramm und Makros, dazu die Summe und `last_used` (neueste Gruppe mit seinem Namen, sonst `null`) (E8) |
| POST | `/combos` | Schnellzugriff anlegen: `name` und `items` oder `group_id` einer Gruppe im Tagebuch (E8) |
| PATCH / DELETE | `/combos/{id}` | Name ändern oder alle Zutaten ersetzen, entfernen (E8) |
| POST | `/recipes` | Rezept anlegen: `name`, `items`, `portions`, optional `cooked_grams` und `description`; legt sein Lebensmittel an ([ADR-0012](adr/0012-recipe-as-food.md)) |
| POST | `/recipes/import` | Rezepttext oder genau ein http(s)-Link (`source`, bis 20.000 Zeichen) → Name, Portionen, Zubereitung und zugeordnete Zutaten wie beim Teller; speichert nichts ([ADR-0014](adr/0014-recipe-import.md)) |
| GET | `/recipes` | alle Rezepte, das zuletzt gespeicherte zuerst („Meine Rezepte“) |
| GET / PATCH | `/recipes/{id}` | Rezept lesen oder ändern; Ändern berechnet das Lebensmittel neu, `cooked_grams: null` nimmt das Fertiggewicht zurück |
| POST | `/combos/{id}/log` | Als Gruppe eintragen, optional mit `meal`, `eaten_at` und angepassten `items` nur für diesen Eintrag (E8) |
| GET | `/foods/search?q=` | lokale Suche (Abschnitt 6): `hits` und `off_more` |
| GET | `/foods/suggestions` | leere Suche (Abschnitt 6, der Wirt): `likely` (Tipps für jetzt) und `recent` (zuletzt verwendet), je Eintrag `food` oder `combo` |
| GET | `/foods/search/off?q=` | Open-Food-Facts-Textsuche, Produkte ohne die lokalen Treffer; bei Fehler leere `hits` mit `reason` ([ADR-0011](adr/0011-off-text-search.md)) |
| GET | `/foods/barcode/{code}` | Barcode-Kette (E3) |
| GET / POST / PATCH | `/foods`, `/foods/{id}` | Lebensmittel lesen, anlegen, ändern, inkl. Portionen und `last_grams` (zuletzt eingetragene Mengen) |
| PUT | `/foods/{id}/image` | Produktfoto hochladen: gespeichert wird das mittige Quadrat als WebP mit höchstens 384 px (einige zehn Kilobyte) |
| POST | `/labels/extract` | Etikett-Foto plus optionale GTIN → Entwurf mit Validierungsergebnis (E4) |
| POST | `/plates/extract` | Teller-Foto → Gericht mit Zutaten, Mengen und Zuordnung, nichts wird eingetragen (E7) |
| POST | `/plates/dictate` | Diktierter Satz `{text}` (1–600 Zeichen) → dasselbe wie `/plates/extract`, nichts wird eingetragen ([ADR-0013](adr/0013-dictation.md)) |
| GET | `/days?from=&to=` | je Tag Summen, geltendes Ziel und Anzahl Einträge, für Kalender und Balken (E9) |
| GET | `/stats?from=&to=` | Statistik eines Zeitraums nach Abschnitt 4: Schnitte, Ziel im Schnitt, Tage im Zielbereich je Wert, erfasste und mögliche Tage, Vergleich zum Zeitraum davor, Wochentage, Tageszeiten, häufigste Lebensmittel (E9) |
| GET / PUT | `/goals/default` | Standardziel, das heute gilt; `PUT` mit `kcal`, `protein`, `fat` setzt es ab heute, die Kohlenhydrate rechnet das Backend (E5, E9) |
| GET | `/goals` | alle Standardziele mit `valid_from`, das neueste zuerst (E9) |
| GET / PUT | `/settings` | Toleranz (E9) |
| GET / PUT / DELETE | `/goals/{date}` | Tagesziele: lesen, setzen, entfernen; ohne Tagesziel gilt das Standardziel (E5) |

**MCP-Server** (E5, [ADR-0007](adr/0007-mcp.md)): Er liegt unter `/mcp` im API-Container und nutzt dieselben Services. Lesend sind `search_food`, `get_food`, `list_entries`, `daily_summary` und `list_combos`, schreibend nur `log_meal` und `log_combo` (per `combo_id` oder Name, E8).

## 6. Suche

**Quellen:**
- Die lokale Suche durchsucht die eigene DB, die importierten BLS-Lebensmittel und den OFF-Cache ([ADR-0002](adr/0002-data-sources.md)).
- Diese Quellen liegen in Postgres, darum läuft die lokale Suche ohne Netz-Timeouts, auch wenn sie mehrere lokale Abfragen stellt (Markennachschlag, gefilterter und ungefilterter Lauf).
- **Open Food Facts live** ([ADR-0011](adr/0011-off-text-search.md)): Hat die lokale Suche weniger als 5 Treffer bei mindestens 3 Zeichen, setzt sie `off_more`. Die App fragt dann `/foods/search/off` und hängt die Treffer unten an, mit „Suche bei Open Food Facts …“ und dem Hinweis „Daten von Open Food Facts (ODbL)“.
  - Gefragt wird Search-a-licious mit Sprache Deutsch und Land Deutschland, Timeout 3 s.
  - Höchstens 6 Anfragen pro Minute (Open Food Facts erlaubt 10). Dieselbe Suche gilt 24 h aus dem Speicher.
  - Jedes Produkt geht in den OFF-Cache und wird über seine GTIN eingetragen.
  - Treffer der lokalen Suche kommen nicht doppelt. Ein Produkt mit der GTIN eines Lebensmittels ist dieses Lebensmittel.

**Normalisierung**, in Python und als generierte Spalte:
- Kleinschreibung und `unaccent`.
- ä→ae, ö→oe, ü→ue, ß→ss.
- Bindestriche und Satzzeichen werden zu Leerzeichen, Mengenangaben wie `500 g` oder `1,5 l` fallen weg.

**Kandidaten:** `pg_trgm` über `name_norm` und Marke, mit `word_similarity` für Teilwörter und Tippfehler.

**Alltagsnamen:** Der BLS benennt systematisch („Hühnerei roh“, „Teigwaren eifrei, gekocht“). `data/bls/aliases.csv` ordnet Alltagswörtern wie „Ei“, „Milch“ oder „Nudeln“ die gemeinten BLS-Lebensmittel zu.
- Ist die Suche ein solches Wort (auch im Plural), zählt es für diese Lebensmittel wie ein Name, der mit dem Wort beginnt. Sie stehen damit vor Gerichten, die das Wort nur enthalten („Ei-Einlauf“).
- Ein eigenes, genutztes Lebensmittel bleibt davor.

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

**Der Wirt** (leere Suche): Wie der Wirt einer Stammkneipe, der morgens den Kaffee und abends das Bier hinstellt, sagt er den nächsten Eintrag aus dem Tagebuch vorher. Es wird nichts trainiert und nichts gespeichert: Jeder Eintrag ist eine Beobachtung, Zählen ist das Lernen.
- Ein Lebensmittel bekommt Punkte aus vier Fragen:
  - **Wie oft und wie frisch?** Jeder Eintrag zählt mit Halbwertszeit 30 Tage.
  - **Passt die Uhrzeit?** Ein Eintrag zur selben Tageszeit zählt bis zu fünffach, mit etwa 1,5 h Reichweite. In einem jungen Tagebuch wiegt die Uhrzeit wenig: Nach 7 Tagen mit Einträgen hat sie ihr halbes Gewicht.
  - **Was kommt meist danach?** Ein Lebensmittel, das bisher innerhalb von 30 Minuten auf das eben Eingetragene folgte, rückt hoch.
  - **Heute schon eingetragen?** Dann rückt es nach unten, außer es kommt üblicherweise mehrmals am Tag.
- Geraten werden Lebensmittel aus Einzeleinträgen und Schnellzugriffe. Ein Gericht, das den Namen eines Schnellzugriffs trägt, zählt als ein Eintrag dieses Schnellzugriffs. Die Zutaten eines Gerichts werden nicht einzeln geraten, zählen aber als „eben eingetragen“.
- Die Gewichte stehen in `SuggestConfig`. Der **Rückblick-Test** `python -m app.search.suggest_backtest` spielt das Tagebuch nach und fragt für jeden Einzeleintrag, auf welchem Platz das Lebensmittel kurz davor stand. Er vergleicht den Wirt mit „zuletzt verwendet“ und mit der Nutzung der Zuletzt-Chips (Platz 1, unter den Tipps, mittlerer Kehrwert des Platzes) und liest nur. Gewichte werden erst geändert, wenn er mit genug Einträgen einen Vorteil zeigt.

**Barcode** (E3):
- EAN-8, EAN-13 und UPC-A werden auf GTIN-14 normalisiert (führende Nullen).
- Kette: eigene DB, dann OFF-Cache, dann OFF live (Timeout 2 s), dann „Etikett fotografieren“.
- Ohne Treffer nennt die Antwort (404) den Grund `reason`:
  - `unknown`: Open Food Facts kennt das Produkt nicht.
  - `incomplete`: Open Food Facts kennt es ohne Name oder Energiewert. `name` und `brand` gehen an den Editor und stehen dort vor den Werten aus dem Etikett.
  - `unavailable`: Timeout, Fehlerstatus oder lokales Limit. Ob es das Produkt gibt, ist dann offen.
- Im Live-Bild zählt ein EAN-13 sofort, ein EAN-8 oder UPC-A erst nach zwei gleichen Lesungen in Folge, mit dem Leser des Browsers wie mit ZXing.

## 7. Etikett-Extraktion (E4)

[ADR-0004](adr/0004-llm-extraction.md)

**Ein- und Ausgabe:**
- Eingabe ist das Foto plus die GTIN aus dem Scan. Die GTIN liest nie das Modell.
- Die GTIN ist optional. Ohne GTIN entsteht ein Lebensmittel ohne GTIN.
- Die Ausgabe ist strukturiert nach festem JSON-Schema: `name, brand, package_size, per_100 {basis, state, energy_kj, energy_kcal, fat, saturated_fat, carbs, sugar, fiber, protein, salt, alcohol_vol}, servings [{label, amount, unit, source}], confidence, notes`.
- `alcohol_vol` ist der Alkoholgehalt in % vol, wenn das Foto einen zeigt. Er dient nur der Prüfung und wird nicht gespeichert.
- Der Editor zeigt `notes` und weist auf `state = prepared` hin.

**Prompt:** Er fängt drei typische Fehler ab: die Spalte je 100 g gegenüber je Portion, zubereitet gegenüber unzubereitet sowie g gegenüber ml.

**Validierung im Code:**
- Atwater: `4·KH + 4·Eiweiß + 9·Fett + 2·Ballaststoffe + 7·Alkohol` weicht höchstens 10 % oder höchstens 10 kcal von kcal ab. Alkohol in g je 100 ml ist % vol · 0,789.
  - Die 10 kcal fangen Rundung und Angaben wie „< 0,5 g“ ab; ohne sie galt jedes Getränk mit wenigen kcal als unplausibel.
- `kJ ≈ kcal · 4,184` (± 5 %), `Zucker ≤ KH`, `gesättigte Fettsäuren ≤ Fett`.

**Modelle:**
- Ein schnelles Modell als Standard und ein stärkeres als Fallback, beide konfigurierbar.
- Bei einem Regelverstoß folgt genau ein zweiter Versuch mit dem stärkeren Modell. Bleibt der Verstoß, zeigt der Editor die Warnung. Liefert das stärkere Modell keinen brauchbaren Entwurf, bleibt der des schnellen mit seiner Warnung.
- Das Backend liest das Etikett-Foto nur aus und speichert es bei der Extraktion nicht. Die App legt dasselbe Foto beim Speichern des Lebensmittels als Produktfoto ab (`PUT /foods/{id}/image`).

## 7a. Teller-Erkennung (E7)

[ADR-0009](adr/0009-plate-recognition.md)

**Ein- und Ausgabe:**
- Eingabe ist das Foto eines Tellers. Die Erkennung liest es nur aus und speichert es nicht.
- Das Modell antwortet nach festem JSON-Schema: `dish, ingredients [{name, grams, confidence}], notes`.
- `POST /plates/extract` liefert `dish`, `items`, `totals` und `notes`. Ein Item hat `food_id` (oder `null`), `name`, `grams`, `confidence`, `certainty` (`recognized`/`guessed`, in der App „erkannt“/„vermutet“, ab `confidence` 0,7 erkannt), das zugeordnete Lebensmittel, dessen `basis` und `density`, dessen Werte je 100 g bzw. 100 ml und `macros` für die Menge. Mit `basis` und `density` rechnet die Vorschau der App wie das Backend.
- `totals` summiert die zugeordneten Items. Eingetragen wird erst nach der Bestätigung.

**Prompt:** Er verlangt eine Zutat je sichtbarem Bestandteil, deutsch und generisch benannt wie im BLS (Lebensmittel, dann Zubereitung), und die Menge in Gramm wie gegessen. Er gibt Mengenanker vor, weil Schätzungen aus Fotos zu hoch ausfallen. Den Namen des Gerichts (`dish`) verlangt er kurz, höchstens etwa drei Wörter („Falafel-Bowl“, „Käsebrot mit Kaffee“), damit er im Tagebuch nicht abgeschnitten wird; das gilt auch für das Diktat.

**Zuordnung:**
- Jede Zutat läuft durch die Suche aus Abschnitt 6, lokal und ohne Netz.
- Der beste Treffer, der ein Lebensmittel ist, wird zugeordnet, wenn sein Score mindestens 1,6 beträgt.
- Trägt dieser Treffer nicht genau den Namen der Zutat, wählt das Modell in einem zweiten Aufruf ohne Foto unter Kandidaten der Suche (ganzer Name und erstes Wort) einen oder keinen. So wird aus „Falafel gebraten“ kein „Trüffel gebraten“. Ohne brauchbare Antwort gilt der Treffer der Suche.
- Ohne solchen Treffer bleibt die Zutat „nicht zugeordnet“: `food_id` ist `null`, Werte gibt es keine. Erfunden wird nichts.

**Regeln im Code:** Ein Entwurf verstößt gegen die Regeln, wenn er keine Zutat hat, eine Zutat ohne Namen, eine Menge ≤ 0 g oder über 1.500 g, einen Teller über 3.000 g oder eine `confidence` außerhalb von 0 bis 1.

**Modelle:** wie beim Etikett (Abschnitt 7). Das schnelle Modell liest zuerst. Bei einem Regelverstoß folgt genau ein zweiter Versuch mit dem starken. Liefert das starke keinen brauchbaren Entwurf, bleibt der des schnellen.

**Diktat** ([ADR-0013](adr/0013-dictation.md)): `POST /plates/dictate` nimmt statt des Fotos den Satz, den das Handy gehört hat. Modelle, Schema, Regeln, Rückfall und Zuordnung sind dieselben. Der Prompt verlangt ein Lebensmittel je genanntem, BLS-Namen wie beim Foto und eine gesagte Menge vor der Schätzung; ohne Angabe gilt eine übliche Portion. Der Satz steht in `<satz>` und ist nie eine Anweisung.

**Eintragen als eigenes Lebensmittel** ([ADR-0012](adr/0012-recipe-as-food.md), Nachtrag in ADR-0009):
- Die App legt aus Name und zugeordneten Zutaten ein Rezept mit einer Portion an (`POST /recipes`), lädt das Tellerfoto als Produktfoto seines Lebensmittels hoch (`PUT /foods/{id}/image`) und trägt die Standardportion ein (`POST /entries`). Das Rezept gilt auch ohne Foto.
- Scheitert der Eintrag, ändert ein zweiter Versuch dasselbe Rezept (`PATCH /recipes/{id}`), statt es doppelt anzulegen.
- Der Teller steht danach in Suche, leerer Suche und „Meine Rezepte“ und lässt sich wieder eintragen.

**Gericht** (Gruppe eines Schnellzugriffs oder der API):
- `POST /entries/group` legt je Zutat einen Eintrag an. Alle Einträge teilen `group_id`, `group_name`, Mahlzeit und Zeitpunkt.
- Die Snapshot-Regel gilt je Eintrag (Abschnitt 4). Eine geänderte Menge (`PATCH /entries/{id}`) ändert nur den Snapshot dieses Eintrags.
- `PATCH /entries/group/{id}` ändert Mahlzeit oder Name aller Einträge. `DELETE /entries/group/{id}` entfernt sie, auch für „Rückgängig“.
- `/days` führt in `rows` jedes Gericht als eine Zeile mit `group_id`, `group_name`, `meal`, `eaten_at`, `totals` und seinen Einträgen. Je Mahlzeit stehen zusätzlich alle Einträge und `groups` mit `entry_ids`. Die Summen rechnet das Backend.

## 8. Tests

Pflicht ab E1: Jedes Epic endet mit grünen Tests und lauffähigem `docker compose up`.

- **Backend:** pytest gegen einen echten Postgres-Container mit eigener Test-Datenbank.
- **Goldenes Suchtestset** (ab E1 wachsend, Ziel ca. 30 Paare in E2): Tippfehler, Umlaut-Varianten, Markenfilter, GTIN mit und ohne führende Null, „banane“ → genau ein Treffer auf Platz 1.
  - Treffer auf Platz 1 ≥ 90 %, in den Top 5 ≥ 98 %.
  - Dublettenrate in den Top 10 = 0.
  - p95 lokal < 300 ms.
  - Die Suite schlägt fehl, wenn eine Schwelle reißt.
- **Adapter-Tests** mit OFF-Antworten in der Form echter Antworten, ohne OFF-Daten (`respx`), inklusive Timeout und Ausfall. Für die Textsuche auch Limit, Query-Cache, Dubletten und das Schreiben in den OFF-Cache.
- **Extraktion:**
  - Validierungsregeln als Unit-Tests.
  - Etiketten-Fixtures mit erwarteten Werten, als markierter Test, der nur mit gesetztem Token läuft: erzeugte Etiketten erfundener Produkte mit bekannten Werten ([ADR-0002](adr/0002-data-sources.md)).
  - Echte Etiketten (Marker `llm` und `realdata`): je Satz ≥ 90 % der Felder in Toleranz. Energie ± 5 %, die übrigen Werte ± 0,5 g oder ± 5 %, das Größere gilt; die Basis g/ml muss stimmen.
- **Echte Fototestsätze** (Marker `realdata`, [ADR-0008](adr/0008-real-photo-fixtures.md)): Barcode-Fotos mit Ground Truth, frei lizenziert im Repo und lokal unter `BISS_REAL_FIXTURES`; je Satz ≥ 75 % richtige Ziffern und keine Fehllesung; ein EAN-8 oder UPC-A gilt erst nach Bestätigung durch einen zweiten Versuch.
- **Teller-Fotos** (Marker `llm` und `realdata`, [ADR-0009](adr/0009-plate-recognition.md)): Ground Truth mit Hauptzutaten, bei gewogenen Tellern auch kcal. Die Zuordnung läuft gegen den vollen BLS-Seed. Je Satz gelten:
  - Recall der Hauptzutaten ≥ 70 %.
  - kcal innerhalb ± 35 % bei ≥ 70 % der Teller mit kcal.
  - p95 der Zeit je Foto < 15 s.
  - Daneben vergleicht der Benchmark `tests/test_plates_bench.py` Modelle und Varianten auf denselben Fotos, mit mehreren Durchläufen: genannte Hauptzutaten, richtig zugeordnete, erfundene Zutaten und Zutaten ohne Lebensmittel. Er setzt keine Schwellen.
- **Frontend:** Vitest für Komponenten und das Schrittraster der Gramm. Die Kernabläufe laufen als Playwright-E2E: Zuletzt-Chip mit Rückgängig, Suche → Eintrag, Eintrag bearbeiten, Barcode-Treffer (E3), Etikett → Editor → Eintrag (E4, LLM gemockt), Etikett ohne Barcode → Editor → Eintrag (E6, LLM gemockt), Teller → Ergebnis → Eintrag als eigenes Lebensmittel mit Foto, Anzahl Portionen ändern (E7, LLM gemockt), Diktat → Ergebnis → Eintrag ohne Foto und Abbruch per Zurück-Taste (ADR-0013, Spracherkennung und LLM gemockt), Schnellzugriff anlegen, per Tap eintragen mit Rückgängig, das zuletzt verwendete vorn in der Chip-Reihe, anpassen und aus einer Gruppe im Tagebuch merken (E8), unbekanntes Produkt → Open-Food-Facts-Treffer → Mengen-Sheet → Eintrag (Stub, ADR-0011), Rezept anlegen → zwei Portionen eintragen → Fertiggewicht nachtragen (ADR-0012), Rezept aus Text → Speichern und ein Entwurf, der Escape und Neuladen übersteht (ADR-0014, LLM gemockt), gestern per Pfeil und ein Tag aus dem Kalender, Nachtragen auf gestern mit Rückgängig, Statistik → Balken → Tag öffnen, Ziel ab heute ändern und gestern behält sein Ziel (ADR-0015). Die beiden E6-Abläufe (Barcode-Foto, Etikett ohne Barcode), der Teller-Ablauf, das Diktat, der Schnellzugriff und die leere Suche zählen dabei ihr Tap-Budget aus Abschnitt 1: Teller = Kamera + Auslöser + Eintragen, Diktat = Mikrofon + Fertig + Eintragen, Schnellzugriff = 1, leere Suche = Suche + 2, Schnellzugriff aus der leeren Suche = Suche + 1, Zutat zu einem Gericht = aufklappen + 3, Rezept aus „Meine Rezepte“ = Reiter Rezepte + 2, Rezept aus Text = Reiter Rezepte + 3, gestern = 1, Tag im selben Monat = Datum + 1, zurück zu heute = 1, Statistik = 1, Einstellungen = 1.

## 9. Betrieb

[ADR-0006](adr/0006-stack-and-tooling.md)

- **Plattform:** Docker Compose in Docker Desktop, immer aktuell gehalten. Web auf Port 2477, API auf 2478, Postgres nur intern.
- **Weiterleitung:** Web leitet `/api/v1` an die API weiter und wartet bis zu 200 s, weil ein Etikett oder Teller zwei Modellaufrufe von je bis zu 90 s brauchen kann.
- **Logs:** `db`, `api` und `web` behalten höchstens 3 Dateien zu je 10 MB.
- **PWA:** Die App hat ein Manifest und lässt sich auf dem Handy zum Startbildschirm hinzufügen.
- **Volumes:** `db-data` und `images`.
- **Zugang:** keine Authentifizierung, die App läuft im lokalen Netz ([ADR-0005](adr/0005-no-auth-mvp.md)). Für die Kamera braucht es HTTPS, das kommt über den Compose-Dienst `tailscale` im eigenen Tailnet (README, „Starten“), nie über Tailscale Funnel. Ohne Tailscale läuft der Kamera-Test über `localhost`. Der Test mit echter Kamera und echter Packung aus E3 ist am 29.10.2026 über Tailscale auf dem Handy bestanden.
- **Konfiguration** per `.env`: Token, Modellnamen, Standardziele (2.400 kcal / 160 g E / 260 g KH / 75 g F), solange in den Einstellungen keines gespeichert ist.
- **Backup** (E5): nächtlich `pg_dump` plus ein Tarball der Bilder auf ein gemountetes Verzeichnis. Die letzten 14 Sicherungen bleiben erhalten.
