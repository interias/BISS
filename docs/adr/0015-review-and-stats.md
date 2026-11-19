# ADR-0015: Rückblick, Statistik und Ziele ab heute

Status: angenommen · 19.11.2026 · Auftrag des Menschen, Varianten im Prototyp [docs/design/rueckblick.html](../design/rueckblick.html)

## Kontext
SPEC 1 sagte bisher „Nur erfassen“: Die App zeigt nur den heutigen Tag, Auswertungen laufen extern ([ADR-0007](0007-mcp.md)). Im Alltag fehlt aber der Blick auf gestern und die Frage „Wie war die Woche, wie war der Monat?“. Dazu sollen Ziele und Toleranz in der App einstellbar sein. Ein geändertes Standardziel schreibt bisher alle vergangenen Tage ohne eigenes Tagesziel mit um.

## Entscheidung
- **Erfassen bleibt die Hauptsache.** Tap-Budgets des Erfassens ändern sich nicht. Rückblick und Statistik kommen dazu, ohne das Dock zu verdrängen.
- **Anderer Tag:** Ein Pfeil links vom Datum geht einen Tag zurück, ein Tipp aufs Datum öffnet einen Kalender mit Ringen je Tag. Die App öffnet immer mit heute.
- **Alte Tage sind geschützt:** Auf einem früheren Tag ersetzt eine Leiste „Zurück zu heute · + Nachtragen“ das Dock. Erst „Nachtragen“ holt das Dock zurück, mit einem Band „Trägt ein für <Tag>“. So landet kein Eintrag still auf dem falschen Tag (Leitsatz, Regel 5).
- **Navigationsleiste:** Heute, Rezepte, Kamera, Statistik, Einstellungen. Die Kamera steht erhaben in der Mitte und ist aus jedem Bereich mit einem Tap erreichbar. Das Kochbuch zieht aus dem Dock in den Reiter Rezepte.
- **Statistik als Überblick:** Woche (Mo bis So) oder Kalendermonat. Oben der Schnitt je Tag gegen das Ziel, darunter Kalorien je Tag, Nährstoffe, erfasste Tage, Wochentag (nur Monat), Tageszeit und die häufigsten Lebensmittel. Ein Tipp auf einen Tag öffnet sein Tagebuch.
- **Ehrliche Zahlen:** Es zählen nur abgeschlossene Tage mit mindestens einem Eintrag. Über dem Ziel wird nichts rot. Es gibt keine Serien, Noten, Abzeichen oder Erinnerungen.
- **Ziele ab heute:** Ein Standardziel gilt ab einem Tag (`valid_from`). Eine Änderung in den Einstellungen gilt ab heute, frühere Tage behalten das Ziel, das an ihnen galt. Ein Tagesziel der Fitness-App (`PUT /goals/{date}`) geht weiter vor.
- **Toleranz:** Ein Wert liegt im Zielbereich, wenn er höchstens um die Toleranz vom Ziel abweicht, Standard ±10 %. Sie ist eine Sicht der Statistik und gilt für alle Tage.
- **Rechnen im Backend** ([ADR-0003](0003-logic-in-backend.md)): Zählregeln, Schnitte, Zielbereich und das geltende Ziel je Tag liefert die API. Die App zeigt nur an.

## Alternativen verworfen
- **Datum nur antippen, Wochenstreifen oder Wischen:** Antippen allein ist unsichtbar, der Streifen kostet dauerhaft eine Tagebuchzeile, Wischen ist unsichtbar und kollidiert am Rand mit der Zurück-Geste von Android.
- **Zwei oder drei Reiter ohne Rezepte:** Mit Heute, Statistik und Einstellungen säße die Kamera in der Mitte schief. Drei Reiter mit der Kamera im Dock kosten einen Tap mehr zur Kamera aus jedem anderen Bereich.
- **Kalender oder Kurzbericht als Statistik:** Der Kalender beantwortet „Was war an dem Tag?“, nicht „Wie war die Woche?“. Der Kurzbericht zeigt keinen Verlauf.
- **Ziele rückwirkend ändern:** Die Vergangenheit sähe dann anders aus als an dem Tag, an dem sie erfasst wurde. Das widerspricht dem Makro-Snapshot (SPEC 4).
- **Serien und rote Überschreitung:** In Beiträgen über Fitness-Apps führen gerissene Serien und Scham zu Rückzug (UCL/Loughborough, British Journal of Health Psychology, 2025).

## Folgen
- SPEC 1 bis 9 und das Glossar sind angepasst. „Statistik“ ist ab jetzt Teil der App.
- Neue Schnittstellen `GET /days?from=&to=`, `GET /stats`, `GET /goals` und `GET`/`PUT /settings`. `PUT /goals/default` setzt das Standardziel ab heute.
- Migration: Ein gespeichertes Standardziel bekommt als `valid_from` den ersten Tag mit Eintrag.
- Das Mikrofon steht am rechten Ende der Suchzeile, nicht mehr links neben der Kamera ([ADR-0013](0013-dictation.md)).
- Die Leiste nimmt dem Tagebuch etwa eine Zeile. Das Dock bleibt auf heute vollständig.
- Neue Tap-Budgets mit Playwright-Tests: gestern 1, Tag im Monat Datum + 1, zurück zu heute 1, Statistik 1, Einstellungen 1.
