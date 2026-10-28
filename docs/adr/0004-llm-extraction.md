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

## Nachtrag 28.10.2026: Ergebnis des Spikes (#14)
Gemessen mit `api/scripts/spike_label.py` an den zwei Fixture-Etiketten unter `api/tests/fixtures/labels/` (mit Pillow erzeugt, erfundene Produkte; echte Fotos folgen, Entscheidung an https://github.com/interias/BISS/issues/4#issuecomment-6471176192).

- **Laufzeit im Image:** Das Wheel von `claude-agent-sdk` 0.2.174 bringt die Claude-Code-CLI mit (`claude_agent_sdk/_bundled/claude`, Claude Code 2.1.310, das Paket belegt 280 MB). Node und npm sind nicht nötig. Der Token kommt über die Umgebung aus `compose.yaml` zur CLI.
- **Bildübergabe:** Gewählt ist der Base64-Image-Block über den Streaming-Input, ohne Werkzeuge (`tools=[]`). Er ersetzt die Datei mit dem Werkzeug `Read`. Beide Varianten lasen in allen acht Läufen jeden Wert richtig, auch Spalte, Zustand und Basis. Base64 war im Mittel 5,1 s schnell (n = 5), `Read` 6,1 s (n = 4), vermutlich wegen des zusätzlichen Zugs für das Werkzeug. Ohne Werkzeug liegt das Foto nie als Datei vor, und der Agent kann keine anderen Dateien im Container lesen, auch nicht auf Anweisung von Text auf dem Etikett.
- **Latenz** (Wanduhr je Aufruf mit Start der CLI): `claude-haiku-5-5` im Mittel 5,6 s (4,6–6,2 s, n = 5), `claude-sonnet-5-5` 5,5 s (4,4–7,6 s, n = 4). Mit Base64 allein waren es 5,5 s (n = 3) und 4,5 s (n = 2). Das starke Modell war nicht langsamer, der Fallback kostet also etwa einen zweiten Aufruf.
- **Aufruf:** Es gibt einen eigenen System-Prompt, `setting_sources=[]` und `max_turns=3`. `output_format` enthält das aus dem Pydantic-Modell erzeugte Schema; es hat kein GTIN-Feld und verbietet zusätzliche Felder. Der Berechtigungsmodus ist `dontAsk`, er lehnt alles nicht Erlaubte ab. `bypassPermissions` ist nicht nötig, das die CLI als root verweigert. Das Arbeitsverzeichnis und `CLAUDE_CONFIG_DIR` liegen in einem frischen Temp-Verzeichnis, das nach dem Aufruf gelöscht wird, denn die CLI schreibt das Sitzungsprotokoll samt Bild unter `CLAUDE_CONFIG_DIR`. Das Foto wird vorher im Speicher auf JPEG mit höchstens 1568 px Kantenlänge gebracht.
- **Schnittstelle:** `LabelExtractor` in `app/labels/extractor.py`, umgesetzt von `AgentLabelExtractor` (`app/labels/agent.py`). Mit `LABEL_EXTRACTOR=fake` liefert ein Fake einen erfundenen, festen Entwurf ohne Modell, für Tests und den E2E-Stack.
