# ADR-0008: Echte Fototestsätze

Status: angenommen · 28.10.2026

## Kontext
Alle Tests der Foto-Erkennung liefen bisher gegen erzeugte Bilder: Barcodes von Hand gezeichnet, Etiketten mit Pillow. Am 28.10.2026 fand ZXing in einem echten Handyfoto (12 MP, Barcode klein und schräg) nichts. Erzeugte Bilder reichen also nicht. Echte Fotos brauchen aber eine Lizenz, und OFF-Daten gehören nicht ins Repo ([ADR-0002](0002-data-sources.md)).

## Entscheidung
- **Repo-Satz:** Im Repo liegen nur frei lizenzierte Bilder von Wikimedia Commons (CC0, CC BY, CC BY-SA) unter `api/tests/fixtures/real/` (`barcodes/`, später `labels/`). `NOTICE` dort nennt jedes Bild mit Urheber und Lizenz. Keine OFF-Bilder.
- **Lokaler Satz:** Ein größerer Satz liegt außerhalb des Repos, Pfad aus `BISS_REAL_FIXTURES` (Unterordner `barcodes/`, `labels/`, `plates/`). Er ist gitignoriert, Standard ist `./testdata/real`. Dort sind auch OFF-Bilder erlaubt.
- **Ground Truth:** Je Bild gibt es eine YAML-Datei mit gleichem Basisnamen, flache Schlüssel mit Werten in Anführungszeichen, z. B. `code`, `source`, `author`, `license`. Ein Bild ohne YAML oder eine YAML ohne Bild ist ein Testfehler.
- **Marker `realdata`:** Die Tests laufen nur, wenn ein Satz vorhanden ist. Ein leerer Satz wird sichtbar übersprungen und nie als grün gezählt. Jeder Satz wird einzeln bewertet. Der Marker `llm` gilt wie gehabt.

## Folgen
- Der Barcode-Test liest die Fotos mit `sharp` und prüft dieselbe ZXing-Logik wie der Browser (`web/components/camera/decode.ts`). Schwelle: 75 % richtige Ziffern je Satz und null Fehllesungen ([Entscheidung in #26](https://github.com/interias/BISS/issues/26#issuecomment-6477784580)). Mehr erreicht ZXing an diesen Fotos nicht. Messstand vom 28.10.2026: Repo 17/22 = 77,3 %, lokal 24/29 = 82,8 %, je 0 falsch.
- Fünf Fotos liest keine Variante: `butter-setesdal` (kleiner, senkrechter Code), `israel-05` (Aufkleber über den Strichen), `israel-14` und `israel-21` (Wölbung und Perspektive), `israel-23` (dunkel, kontrastarm).
- Ein EAN-8 oder UPC-A gilt erst, wenn ein zweiter Versuch derselben Folge (Größe × Drehung) denselben Code liest; ein EAN-13 gilt sofort. ZXing las an diesen Fotos einen EAN-8 aus einem Teil eines EAN-13, und ein falscher Code öffnet ein falsches Lebensmittel. Das ist schlimmer als „nicht erkannt“. Näheres im Kommentar zu `settle` in `decode.ts`.
- Nachtrag 29.10.2026: Seit HTTPS über Tailscale steht, liest im Live-Bild zuerst der `BarcodeDetector` des Browsers (`web/components/camera/native.ts`), wo er EAN-13 kann (Chrome auf Android); ein Code gilt dort erst, wenn zwei Bilder hintereinander dieselben Ziffern lesen. Bei Fotos liest weiter zuerst ZXing, der `BarcodeDetector` nur, wo ZXing nichts findet. Die gemessene Quote bleibt damit eine Untergrenze. Messen lässt sich der `BarcodeDetector` nur auf dem Handy, nicht im Testlauf.
- `compose.test.yaml` bindet beide Sätze schreibgeschützt in den web-Container ein.
- Neue Fotos kommen mit Lizenzprüfung und `NOTICE`-Eintrag ins Repo.
- Der Repo-Satz enthält nur die 1600-px-Vorschaubilder von Commons, die Originale liegen im lokalen Satz. So bleibt das Repo klein.
- Für EAN-8 und UPC-A gibt es kein frei lizenziertes echtes Foto. Die Schwelle gilt für das Vorhandene, EAN-8 und UPC-A prüft der lokale Satz: Er enthält 2× UPC-A und 1× EAN-8 von OFF.
- Mehrsprachige und fremdsprachige Etiketten zählen im Etiketten-Satz mit.
- Ground Truth wird nur aus dem Bild selbst abgelesen, nie aus OFF übernommen.

## Nachtrag 28.10.2026: Teller (E7)
Der Repo-Satz `plates/` enthält neben Commons-Bildern fünf Teller aus Nutrition5k (Google Research, CC BY 4.0), weil nur dieser Datensatz gewogene Mengen und kcal liefert. Die Ground Truth dieser Teller stammt aus der Annotation des Datensatzes, nicht aus dem Bild ([Entscheidung](https://github.com/interias/BISS/issues/25#issuecomment-6477090945), [ADR-0009](0009-plate-recognition.md)). Commons liefert nur feste Vorschaugrößen; die Commons-Teller liegen als Vorschaubild mit 1280 px Breite im Repo, der größten Stufe unter 1600 px. Die Nutrition5k-Teller liegen in ihrer Originalgröße von 640 × 480 px im Repo.
