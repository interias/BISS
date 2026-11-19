# Einheitliches Interface

Stand: 19.11.2026 · gilt für jede Änderung an `web/`, zuerst für E9 ([ADR-0015](../adr/0015-review-and-stats.md))

## Was „einheitlich“ heißt

Die Nielsen Norman Group zählt „Consistency and Standards“ zu den zehn Heuristiken für Bedienbarkeit. Sie unterscheidet zwei Arten ([NN/g](https://www.nngroup.com/articles/consistency-and-standards/)):

- **Innere Einheitlichkeit:** Innerhalb der App sieht dasselbe gleich aus, heißt gleich und verhält sich gleich.
- **Äußere Einheitlichkeit:** Die App folgt den Gewohnheiten des Handys, etwa der Zurück-Taste, der Leiste unten und der Zifferntastatur für Zahlen.

Der Nutzen: Wer einen Baustein einmal gelernt hat, kennt ihn überall. Das spart Nachdenken und Taps und passt damit zum Leitsatz.

Für BISS folgen daraus sieben Regeln:

1. **Ein Baustein je Aufgabe.** Gibt es für eine Aufgabe schon einen Baustein, wird er wiederverwendet und nicht nachgebaut. Beispiele sind `Sheet`, der Toast, `MacroLine`, `kicker`, `addPill` und `hitArea` in `web/lib/styles.ts`.
2. **Gleiche Wörter.** Begriffe kommen aus [CONTEXT.md](../../CONTEXT.md). Knöpfe sagen, was passiert („Ab heute übernehmen“, „Verwerfen“), und der Toast bestätigt es danach.
3. **Gleiche Zahlen.** Zahlen werden immer mit `fmt` deutsch formatiert („2.400“), stehen mit `tabular-nums` und tragen ihre Einheit. Ein Datum kommt immer aus einer Funktion in `web/lib/format.ts`.
4. **Gleiche Farben.** Eiweiß, Kohlenhydrate und Fett haben überall ihre drei Farben und diese Reihenfolge. Kalorien und die aktive Auswahl stehen in der Akzentfarbe. Warnfarbe gibt es nur für Fehler, nie für „zu viel gegessen“.
5. **Gleiche Rückmeldung.** Jede Änderung, die etwas speichert, bestätigt ein Toast, wenn möglich mit „Rückgängig“. Jeder Fehler eines Aufrufs zeigt „Das hat nicht geklappt. Verbindung prüfen.“
6. **Gleiche Wege.** Die Zurück-Taste schließt zuerst ein Blatt, dann einen Unterschritt. Escape und Scrim tun dasselbe. Hauptknöpfe stehen unten rechts, der Abbruch links daneben.
7. **Gleiche Maße.** Tippflächen sind mindestens etwa 40 px groß, Abstände kommen aus den bestehenden Klassen, und Ecken sind so rund wie bei den vorhandenen Elementen gleicher Art.

## Entscheidungen für E9

Zu jeder Frage stehen mindestens drei Möglichkeiten. Die gewählte ist fett.

| Frage | Möglichkeiten | Wahl und Grund |
|---|---|---|
| Wie hängen Kalorien und Nährwerte zusammen? | A Nährwerte in Gramm, die Kalorien ergeben sich · B Kalorien und Anteile in Prozent · **C Kalorien, Eiweiß und Fett in Gramm, Kohlenhydrate sind der Rest** · D drei Schieberegler, die zusammen 100 % ergeben | **C.** Das Kalorienziel bleibt genau die Zahl, die du eingibst, und eine Änderung zieht die Kohlenhydrate automatisch mit. Eiweiß und Fett denken die meisten in Gramm, nicht in Prozent. Prozent als Eingabe verwirrt, weil unklar ist, worauf sie sich beziehen. Drei Schieber kosten auf dem Handy viele Taps und lassen sich schwer genau setzen. |
| Wie sieht der Kopf der Reiter aus? | **A wie Heute: Logo links, Titel, Aktion rechts** · B großer Titel wie bei iOS · C Titel in der Mitte | **A.** Der Kopf bleibt beim Wechsel der Reiter an derselben Stelle, nur der Titel ändert sich. |
| Wie werden Ziele eingegeben? | **A Zahlenfelder wie im Lebensmittel-Editor** · B Gramm-Feld mit −/+ wie im Mengen-Sheet · C Schieberegler | **A.** Ziele sind Stammdaten wie die Nährwerte im Editor. −/+ gehört zu gegessenen Mengen. Schieber sind ungenau. |
| Wie wird gespeichert? | **A feste Fußleiste „Verwerfen · Ab heute übernehmen“, nur bei einer Änderung** · B sofort speichern bei jeder Eingabe · C Speichern im Kopf | **A.** So speichert schon der Lebensmittel-Editor. Ein Zielwechsel ist eine bewusste Entscheidung, sofortiges Speichern würde Zwischenstände als neues Ziel ablegen. |
| Wie wählt man zwischen wenigen Werten (Woche/Monat, Toleranz)? | **A ein gemeinsamer Umschalter in Segmenten** · B Chips wie die Portionen · C Auswahlliste | **A.** Es gibt genau einen Baustein für „eins von wenigen“. Chips bedeuten in BISS „antippen trägt ein“. Eine Auswahlliste kostet einen Tap mehr. |
| Wie wählt man einen Tag? | **A Blatt „Tag wählen“ wie alle Blätter** · B eigene Seite · C Datumsfeld des Browsers | **A.** Ein Blatt kennt die Zurück-Taste schon und zeigt die Ringe der Tage. Das Datumsfeld des Browsers sieht auf jedem Gerät anders aus. |
| Wie sind die Statistik-Abschnitte gebaut? | **A Abschnitte mit Kennzeile und Trennlinie wie Tagesbilanz und Tagebuch** · B Karten mit Schatten · C Unterreiter | **A.** So sind die Seiten schon gebaut. Karten würden eine zweite Formensprache einführen. |
| Woher kommen die Symbole? | **A eigene Linien-Symbole wie im Dock (Strich 2 px, runde Enden)** · B eine Symbolbibliothek · C Emoji | **A.** So sind Dock und Kamera schon gezeichnet. Eine zweite Quelle hätte andere Strichstärken. |
| Wie sieht der Tag im Kalender aus? | **A kleiner Ring wie der Kalorienring** · B Farbfläche je Menge · C nur ein Punkt | **A.** Der Ring bedeutet schon „Anteil am Ziel“. Eine Farbfläche bräuchte eine eigene Legende, ein Punkt zeigt keine Menge. |
| Wie zeigt die Statistik „über dem Ziel“? | **A dieselbe Farbe, die Ziellinie zeigt die Lage** · B Rot über dem Ziel · C Grün im Zielbereich, sonst grau | **A.** Farbe bleibt Erkennung, kein Urteil (ADR-0015). Rot und Grün würden zudem den Statusfarben widersprechen. |

## Prüfliste für jede Änderung

- Nutzt die Änderung einen vorhandenen Baustein, wo es einen gibt?
- Kommen alle Begriffe aus dem Glossar?
- Laufen alle Zahlen und Daten durch `web/lib/format.ts`?
- Stehen Eiweiß, Kohlenhydrate und Fett in Farbe und Reihenfolge wie überall?
- Bestätigt ein Toast jede Speicherung, und gehen Zurück-Taste, Escape und Scrim gleich?
- Sieht die Änderung hell und dunkel richtig aus?
