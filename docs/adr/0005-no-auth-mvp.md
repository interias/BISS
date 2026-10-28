# ADR-0005: Keine Authentifizierung im MVP

Status: angenommen · 28.10.2026

## Kontext
BISS läuft zunächst nur im lokalen Netz auf Docker Desktop. Erreichbarkeit von unterwegs ist später über Tailscale geplant.

## Entscheidung
API, Web und MCP laufen ohne Login und ohne Token. Authentifizierung ist das letzte Epic.

## Folgen
- Jeder im lokalen Netz kann lesen und schreiben. Das ist für den privaten Betrieb akzeptiert.
- Die Kamera braucht HTTPS außer auf `localhost`. Bis Tailscale steht, wird die Kamera am Rechner oder per Dateiupload getestet.
- Vor dem Betrieb außerhalb des eigenen Netzes muss dieses ADR abgelöst werden.
