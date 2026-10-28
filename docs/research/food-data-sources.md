# Nährwert-Datenquellen für BISS

Stand der Recherche: 28.10.2026. Quellen sind Primärseiten der Herausgeber; was nicht direkt bestätigt werden konnte, ist mit **(unbestätigt)** markiert.

Anforderung: (a) Barcode-Lookup für deutsche Markenprodukte, (b) generische Lebensmittel mit deutschen Namen; kcal, Eiweiß, Kohlenhydrate, Fett, Ballaststoffe je 100 g, möglichst Zucker, gesättigte Fettsäuren, Salz, Portionsgrößen. Nutzung privat, Repo öffentlich.

## Vergleich

| Quelle | Lizenz | Daten ins öffentliche Repo? | Deutsch | Umfang | Format / Größe | API | Pflege | Eignung |
|---|---|---|---|---|---|---|---|---|
| **BLS 4.0** (MRI, DE) | CC BY 4.0 | Ja, mit Namensnennung und Hinweis auf Änderungen | Ja (+ Englisch) | 7.140 Lebensmittel, 138 Nährstoffe | ZIP 14 MB mit XLSX (UTF-8, Dezimalkomma) | Nein | Versionen + Errata, kein fester Turnus | **Generische Lebensmittel: erste Wahl** |
| **Open Food Facts** | ODbL (DB), DbCL (Inhalte), CC BY-SA (Bilder) | Nur unter ODbL (Share-Alike); besser nicht committen | Ja (`product_name_de`) | ca. 4,9 Mio. Produkte weltweit, ca. 304.000 mit Land Deutschland | JSONL.gz 7,6 GB, CSV.gz 0,8 GB, Parquet 4,3 GB, tägliche Deltas | Ja, ohne Key | Nächtliche Dumps | **Barcode: erste Wahl (Live-API)** |
| **Schweizer Nährwertdatenbank** (BLV) | Keine formale Lizenz; frei, auch kommerziell, mit Quellenangabe | Unklar (Weitergabe nicht geregelt) | Ja (+ FR, IT, EN) | 1.246 Lebensmittel, V 7.1 | XLSX | Ja (Doku als .docx) | Unregelmäßig | Gute Ergänzung zum BLS |
| **CIQUAL 2025** (ANSES, FR) | Etalab 2.0 (≈ CC BY) | Ja, mit Namensnennung | Nein (FR, EN **unbestätigt** für 2025) | 3.484 Lebensmittel, 74 Bestandteile | XML (Nährwerte 69 MB) oder XLSX 1,5 MB | Nein | 2016, 2017, 2020, 2025 | Fallback, Übersetzung nötig |
| **USDA FoodData Central** | CC0 (Public Domain), Nennung erbeten | Ja | Nein (EN) | Branded vor allem US-Produkte; SR Legacy ca. 7.800 **(unbestätigt)** | CSV/JSON, Gesamtpaket ca. 3 GB entpackt (Stand 04/2025) | Ja, kostenloser Key, 1.000 Req/h | Halbjährlich (v15.0 am 30.04.2026) | Gering; Stärke: Haushaltsportionen |
| **Frida 5.5** (DTU, DK) | Nicht ermittelbar **(unbestätigt)** | Unklar | Nein (DA, EN) | > 1.000 Lebensmittel | Download über Web-App | Nein | 2025 | Gering |
| **NEVO 2025/9.0** (RIVM, NL) | Proprietär: © RIVM, kostenlos, nur unverändert | Nein | Nein (NL, EN **unbestätigt**) | **unbestätigt** | Download nach Zustimmung | Nein | Ca. alle 2 Jahre | Ungeeignet |
| **McCance & Widdowson / CoFID** (UK) | OGL v3.0 (Seitenfooter; datensatzspezifisch nicht genannt) | Ja, mit Namensnennung | Nein (EN) | ca. 2.900 **(unbestätigt)** | XLSX 4,4 MB | Nur Quadram-API, CC BY-NC-SA | Letzte Version 03/2021 | Gering, veraltet |
| **Open Food Repo** (CH) | – | – | – | – | – | – | Eingestellt, „moved to openfoodfacts.org“ | Entfällt |
| **EU FCDB / EUOpenFood** (EFSA) | Open Access geplant | – | – | – | – | – | Projekt 2022–2025, Veröffentlichung nicht bestätigt | Beobachten |

Keine der generischen Datenbanken liefert Portionsgrößen; BLS-Werte gelten je 100 g essbaren Anteil. Nur USDA hat Haushaltsmaße, Open Food Facts hat `serving_size` je Produkt.

## Einzelne Quellen

### BLS 4.0 (Bundeslebensmittelschlüssel)
- Seit 16.12.2025 kostenlos. Die Dokumentation (Kap. 9.3) und die Download-Seite nennen **CC BY 4.0** mit der Pflicht, das Max Rubner-Institut als Herausgeber zu nennen. Empfohlenes Zitat: *Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0*. Die Dokumentation nennt ausdrücklich „Softwareentwicklung: Einsatz in Apps“.
- Paket `BLS_4_0_2025_DE.zip` (14,3 MB, auf dem Server zuletzt geändert am 07.09.2026) enthält `BLS_4_0_Daten_2025_DE.xlsx` (7.140 Zeilen, 418 Spalten: Code, deutscher Name, englischer Name, je Nährstoff Wert + Datenherkunft + Referenz), `BLS_4_0_Components_DE_EN.xlsx` und eine PDF-Dokumentation.
- Alle benötigten Felder sind vorhanden (EuroFIR-Codes): `ENERCC` kcal, `PROT625`, `CHO`, `FAT`, `FIBT`, `SUGAR`, `FASAT`, `NACL` (Salz, berechnet).
- Zubereitungsformen sind kodiert (z. B. gekocht), passend zu „Basmatireis gekocht“.
- Für das Repo: Ein aufbereiteter Auszug (nur die benötigten Spalten als CSV/SQLite-Seed) darf committet werden. Dazu gehören eine `NOTICE` oder ein Abschnitt in der README mit Herausgeber, Lizenzlink und dem Hinweis „gekürzt und umformatiert“.
- Der Download-Link auf blsdb.de trägt ein Session-Token. Ein automatischer Download im Build ist deshalb fragil. Laut einem Drittprojekt blockiert OpenAgrar automatisierte Abrufe **(unbestätigt)**.

### Open Food Facts
- API v2: `GET /api/v2/product/{barcode}`. Limits laut offizieller Doku: **15 Req/min/IP für Produktabrufe, 10 Req/min für Suchen**; Überschreitung kann zur IP-Sperre führen. Ein eigener User-Agent `BISS/<version> (<kontakt>)` ist Pflicht; die Doku bittet außerdem um ein API-Nutzungsformular. Der klassische Search-Endpunkt antwortete beim Test mit 503, `search.openfoodfacts.org` (Search-a-licious) funktionierte.
- Ein Testabruf eines deutschen Barcodes lieferte kcal, Protein, KH, Fett, Ballaststoffe, Zucker, Salz und Portionswerte. Die Daten sind Crowdsourcing ohne Gewähr; Vollständigkeit schwankt je Produkt.
- Lizenz: Bei „public use“ der Datenbank oder daraus erzeugter Werke gelten Namensnennung (Link zu openfoodfacts.org und zur ODbL) und Share-Alike für abgeleitete Datenbanken. Rein private Nutzung in der eigenen Instanz löst praktisch nichts aus. Ein Commit von OFF-Daten (z. B. Seed-Dateien) ins öffentliche Repo macht sie öffentlich: Dann muss dieser Teil unter ODbL stehen. Empfehlung: OFF-Daten nur zur Laufzeit holen und in der lokalen, nicht versionierten SQLite cachen. Trotzdem in der UI „Daten von Open Food Facts (ODbL)“ anzeigen, das kostet nichts.
- Ein Dump lohnt bei 50–100 Produkten im Jahr nicht (Parquet allein 4,3 GB).
- Open Food Repo (Schweiz) ist in Open Food Facts aufgegangen.

### Schweizer Nährwertdatenbank
- V 7.1, 1.246 Lebensmittel, viersprachig inkl. Deutsch, XLSX und API. Laut Download-Seite frei nutzbar, auch kommerziell, „unter Angabe eines Quellenvermerks“. Es gibt keine formale Lizenz; ob die Weitergabe der Daten im Repo erlaubt ist, ist nicht geregelt. opendata.swiss führt „Reference Required“ **(Seite lieferte 403, unbestätigt)**.
- Deutsche Namen sind teils schweizerisch (z. B. „Rahm“).

### CIQUAL 2025
- Veröffentlicht am 19.11.2025 auf recherche.data.gouv.fr unter **Etalab 2.0**. 3.484 Lebensmittel, 74 Bestandteile, als XML oder XLS/XLSX. Keine deutschen Namen.

### USDA FoodData Central
- CC0, API mit kostenlosem api.data.gov-Key (1.000 Req/h). Branded Foods sind überwiegend US-Produkte und damit für deutsche Barcodes kaum brauchbar. Englische Namen. Interessant allenfalls die Portionstabellen (`food_portion`) als Vorlage für eigene Standardportionen. Die USDA-Website war während der Recherche per DNS nicht erreichbar; Angaben stammen aus Suchindex-Auszügen der offiziellen Seiten.

### Frida (Dänemark)
- Version 5.5 (2025), laut DTU „more than 1,000 foods“, Download möglich, Dänisch/Englisch. Eine Lizenz war nicht auffindbar (Web-App lädt nur per JavaScript).

### NEVO (Niederlande)
- Nutzungsbedingungen 2025/9.0: Copyright RIVM, Nutzung „only allowed unchanged“ mit Quellen- und Versionsangabe, Ergänzungen nur klar getrennt, keine Gebühren an Endnutzer. Keine offene Lizenz, daher nicht ins Repo.

### McCance & Widdowson (CoFID)
- Letzte Fassung 19.03.2021 auf gov.uk (XLSX 4,4 MB). Die gov.uk-Seite stellt Inhalte unter OGL v3.0 „except where otherwise stated“; Quadram bestätigt OGL für die Daten. Quadrams eigene API und Labelling-Datensätze stehen unter CC BY-NC-SA 4.0. Nur Englisch, britische Lebensmittel.

## Empfehlung MVP

1. **Generische Lebensmittel: BLS 4.0 als lokaler Import.** Ein einmaliges Import-Skript liest die XLSX und schreibt die benötigten Felder (Code, Name DE/EN, kcal, Protein, KH, Fett, Ballaststoffe, Zucker, FASAT, Salz) in die SQLite mit FTS5. Den gekürzten Auszug darf man unter CC BY 4.0 committen (wenige MB). Alternative: nur das Skript committen, die ZIP lokal ablegen. Attribution in README, `NOTICE` und App-Info.
2. **Barcode: Open Food Facts Live-API** mit eigenem User-Agent. Jedes übernommene Produkt wird in der lokalen DB gespeichert (bei 50–100 Produkten im Jahr weit unter jedem Limit). OFF-Daten nicht ins Repo und keinen Dump importieren. Fehlt ein Produkt oder sind die Nährwerte unvollständig, greift der Etikett-Scan per LLM, wie in der README vorgesehen.
3. **Portionsgrößen** liefert keine offene deutsche Quelle. Für das MVP genügt eine kleine, selbst gepflegte Tabelle mit Standardportionen (z. B. „1 Banane mittel“). Bei Markenprodukten wird `serving_size` aus OFF übernommen.
4. **USDA**, wie in der README unter „Stack“ geführt, bringt für deutsche Nutzung wenig und kann im MVP entfallen. Die Schweizer Nährwertdatenbank ist der naheliegende zweite generische Datensatz, falls BLS-Lücken auffallen; vorher die Weitergabe klären (BLV fragen) oder nur lokal importieren.

## Quellen

- BLS: https://www.blsdb.de/ · https://blsdb.de/download · https://blsdb.de/assets/uploads/BLS_4_0_Dokumentation_DE.pdf · https://www.blsdb.de/faq · https://heise.de/-11123877
- Open Food Facts: https://openfoodfacts.github.io/openfoodfacts-server/api/ · https://world.openfoodfacts.org/data · https://world.openfoodfacts.org/terms-of-use · https://huggingface.co/datasets/openfoodfacts/product-database
- Schweiz: https://naehrwertdaten.ch/de/ · https://naehrwertdaten.ch/de/downloads/ · https://www.blv.admin.ch/de/schweizer-naehrwertdatenbank
- CIQUAL: https://doi.org/10.57745/RDMHWY · https://www.anses.fr/en/content/new-enhanced-and-more-representative-version-ciqual-table
- USDA: https://fdc.nal.usda.gov/api-guide · https://fdc.nal.usda.gov/download-datasets
- Frida: https://food.dtu.dk/english/about-us/facilities-and-infrastructure/food-data-database-on-nutrients-in-food · https://www.fao.org/food-composition/tables-and-databases/detail/(denmark--2024)-danish-food-composition-table/en
- NEVO: https://www.rivm.nl/sites/default/files/2025-11/Conditions-of-use-NEVO-online-2025-dataset_0.pdf
- CoFID: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid · https://fnnbri.quadram.ac.uk/?p=34
- Open Food Repo: https://www.foodrepo.org/
- EUOpenFood: https://www.eurofir.org/?p=16925
