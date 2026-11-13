# BISS

## Leitsatz

**So wenige Taps wie möglich bis zum gespeicherten Eintrag. Die Oberfläche bleibt so schlank wie möglich.**

Jede Änderung wird daran gemessen. Daraus folgen fünf Regeln:

1. **Budget halten.** Jeder Ablauf hat ein Tap-Budget ([docs/SPEC.md](docs/SPEC.md), Abschnitt 1). Keine Änderung verschlechtert ein Budget, ohne dass der Mensch das entscheidet.
2. **Budget testen.** Jedes Budget ist ein Playwright-Test, der die Taps zählt. Ein neuer Ablauf bekommt sein Budget und seinen Test im selben Pull Request.
3. **Neues muss sich lohnen.** Ein neues Element im normalen Ablauf (Knopf, Feld, Schritt, Rückfrage) spart einen Tap oder verhindert einen falschen Eintrag. Sonst kommt es nicht hinein.
4. **Hinweise nur im Ausnahmefall.** Hinweise und Zusatzknöpfe erscheinen nur, wenn etwas schiefgeht oder unsicher ist.
5. **Im Zweifel der kürzere Weg**, solange nichts Falsches still gespeichert wird.

## Arbeitsweise

BISS ist ein kleines Privatprojekt und bleibt unkompliziert. Fertige, getestete Arbeit geht ohne Rückfrage den ganzen Weg: committen, pushen, Pull Request öffnen und nach grünen Checks mergen. Gefragt wird weiterhin vor allem, was sich nicht zurückholen lässt: Force-Push, Reset, gelöschte Branches und Eingriffe in die Daten der laufenden App.

## Wo was steht

- Abläufe, Tap-Budgets, Datenmodell und Tests: [docs/SPEC.md](docs/SPEC.md)
- Fachbegriffe: [CONTEXT.md](CONTEXT.md)
- Entscheidungen: [docs/adr/](docs/adr/)
- Starten und Testen: [README.md](README.md)
