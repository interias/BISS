# ADR-0014: Rezept aus Text oder Link

Status: angenommen · 17.11.2026 · Auftrag des Menschen, Ausgestaltung von Claude vorgeschlagen

## Kontext
Ein Rezept von Hand anzulegen heißt, jede Zutat zu suchen und zu wiegen ([ADR-0012](0012-recipe-as-food.md)). Rezepte liegen aber oft schon als Text vor, kopiert aus einer Nachricht oder einer Rezeptseite wie Chefkoch. Das Diktat ([ADR-0013](0013-dictation.md)) legt nur ein Gericht mit einer Portion an und trägt es sofort ein; Portionen und Zubereitung kennt es nicht.

## Entscheidung
- **Einstieg im Rezept-Blatt:** Ein neues Rezept zeigt oben die Pille „+ Aus Text oder Link“. Sie klappt ein Textfeld mit „Übernehmen“ auf. Das Dock bleibt, wie es ist. Tap-Budget: Kochbuch + Neues Rezept + Aus Text oder Link + Übernehmen + Speichern, also „Kochbuch + 4“. Das Einfügen des Texts zählt nicht.
- **Text zu Rezept macht der Teller-Weg** ([ADR-0009](0009-plate-recognition.md)): `POST /recipes/import` mit `{source}` (1 bis 20.000 Zeichen) liest Name, Portionen, Zubereitung und Zutaten mit Gramm (`RecipeDraft`). Es gelten dieselben Modelle, genau ein Rückfall auf das starke Modell und dieselbe Zuordnung über die Suche samt Auswahl unter Kandidaten. Die Regeln sind die eines Topfs: je Zutat über 0 bis 10.000 g, zusammen höchstens 50.000 g, 1 bis 100 Portionen.
- **Mengen:** Eine angegebene Menge geht vor, Stück, Löffel und Tassen werden zu Gramm. „Etwas“ oder „nach Geschmack“ wird geschätzt und als unsicher markiert. Salz, Pfeffer, Gewürze unter etwa 5 g und Wasser fallen weg.
- **Ein Link wird geladen:** Ist `source` genau eine http(s)-Adresse, lädt das Backend die Seite (10 s, höchstens 2 MB, keine Adresse im eigenen Netz). Steht ein schema.org-`Recipe` als JSON-LD darin, geht nur dieser Teil an das Modell, sonst der sichtbare Text, gekürzt auf 20.000 Zeichen.
- **Vorschlag, nicht Speichern:** Die Antwort füllt das Rezept-Blatt: leere Felder bekommen Name, Zubereitung und Portionen, die Zutaten kommen dazu. Gespeichert wird erst mit „Speichern“, eingetragen erst im Mengen-Sheet danach.
- **Nicht zugeordnet ist sichtbar:** Eine Zutat ohne passendes Lebensmittel steht unter „Nicht zugeordnet“ als Pille mit Name und Gramm. Ein Tap sucht sie, die Gramm bleiben. Solange eine offen ist, sagt das Blatt, dass sie nicht mitzählt. Nichts fällt still weg.

## Alternativen verworfen
- **Eigener Knopf im Dock:** Ein Import ist selten. Er kostet im Rezept-Blatt einen Tap mehr, hält aber das Dock schlank.
- **Web Share Target der PWA** (aus der Chefkoch-App „Teilen“ → BISS): spart das Kopieren, braucht aber ein installiertes Manifest mit Share-Ziel und einen eigenen Einstieg. Kann später dazukommen und denselben Endpunkt nutzen.
- **Nur JSON-LD ohne Modell:** Chefkoch-Zutaten wie „1 Becher Sahne“ oder „2 EL Öl“ sind keine Gramm und keine BLS-Namen. Ohne Modell bliebe die Arbeit beim Menschen.
- **Diktat erweitern:** Ein Satz von höchstens 600 Zeichen trägt kein Rezept mit Zubereitung, und das Diktat trägt sofort ein.

## Folgen und Risiko
- Text und Seiteninhalt gehen an das Sprachmodell und können Anweisungen enthalten. Sie stehen in `<rezept>`, spitze Klammern werden entfernt, der Aufruf hat keine Werkzeuge und ein festes Schema. Daraus kann nur ein falscher Vorschlag entstehen, den das Blatt vor dem Speichern zeigt.
- Das Backend ruft fremde Adressen ab. Erlaubt sind nur http und https auf öffentliche Adressen, auch nach jeder Weiterleitung. So erreicht ein Link weder die Datenbank noch andere Dienste im eigenen Netz.
- Manche Rezeptseiten sperren Abrufe ohne Browser. Dann kommt ein Hinweis, und der Text lässt sich weiter einfügen.
- Ein Aufruf dauert wie beim Teller einige Sekunden; das Blatt zeigt solange „Lese Rezept …“.
- Einen Testsatz echter Rezepte mit Schwellen gibt es noch nicht; geprüft sind Verdrahtung, Regeln und Ablauf mit dem Fake.
