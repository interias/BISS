# ADR-0004: Etikett-Extraktion über das Claude Agent SDK mit OAuth-Seat

Status: angenommen · 28.10.2026

## Kontext
Ein Nährwert-Etikett soll in wenigen Sekunden als strukturierter Entwurf vorliegen. Es gibt kein API-Key-Budget, genutzt wird der eigene Claude-Seat. Das Python-Paket `claude-agent-sdk` unterstützt strukturierte Ausgabe (`output_format={"type": "json_schema", "schema": …}`, Ergebnis in `ResultMessage.structured_output`).

## Entscheidung
- Der Backend-Container nutzt `claude-agent-sdk`, authentifiziert über `CLAUDE_CODE_OAUTH_TOKEN` (erzeugt mit `claude setup-token`).
- Alternativ funktioniert `ANTHROPIC_API_KEY`. Beides ist reine Konfiguration und ändert keinen Code.
- Modelle per `.env`: `LLM_MODEL_FAST=claude-haiku-5-5`, `LLM_MODEL_STRONG=claude-sonnet-5-5`.
- Das Bild geht dem Agenten als Datei im Arbeitsverzeichnis zu (Werkzeug `Read`, sonst keine Werkzeuge). Ob ein Base64-Content-Block über den Streaming-Input besser ist, klärt der erste Spike in E4.
- Die Validierung (Atwater, kJ/kcal, Zucker ≤ KH, gesättigte Fettsäuren ≤ Fett) läuft im Code. Bei einem Verstoß gibt es einen zweiten Versuch mit dem starken Modell.
- Die Extraktion hängt hinter einer Schnittstelle `LabelExtractor`. Tests nutzen einen Fake.

## Folgen und Risiko
- Die Agent-SDK-Doku sagt, dass Drittanbieter ohne Freigabe kein claude.ai-Login für ihre Produkte anbieten dürfen, und empfiehlt API-Keys. BISS ist ein privates Werkzeug mit dem eigenen Seat; der Betreiber geht davon aus, dass das erlaubt ist. Ändert sich die Lage, wird auf `ANTHROPIC_API_KEY` umgestellt.
- Das Image braucht die Laufzeit des Agent SDK. Ob die Claude-Code-CLI im Python-Paket mitkommt, prüft der Spike.
