import csv
from pathlib import Path

from openpyxl import Workbook

from app.importers.bls import FIELDS
from app.importers.bls_extract import extract

# A tiny workbook in the layout of the BLS 4.0 XLSX, written by the test itself.
HEADERS = [
    "BLS Code",
    "Lebensmittelbezeichnung",
    "Food name",
    "ENERCJ Energie (Kilojoule) [kJ/100g]",
    "ENERCC Energie (Kilokalorien) [kcal/100g]",
    "ENERCC Datenherkunft",
    "ENERCC Referenz",
    "PROT625 Protein (Nx6,25) [g/100g]",
    "FAT Fett [g/100g]",
    "CHOCAL Kohlenhydrate, berechnet [g/100g]",
    "CHO Kohlenhydrate, verfügbar [g/100g]",
    "CHO Datenherkunft",
    "FIBT Ballaststoffe, gesamt [g/100g]",
    "NACL Salz (Natriumchlorid) [g/100g]",
    "SUGAR Zucker (Mono- und Disaccharide), gesamt [g/100g]",
    "FASAT Fettsäuren, gesättigt, gesamt [g/100g]",
]
ROWS = [
    ["X100000", "Testapfel roh", "Test apple, raw", 220, 52, "A", "R1",
     0.3, 0.2, 99, 12.4, "A", 2.3, 0.002, 10.1, 0.04],
    ["X200000", "Testöl", "Test oil", 3700, 899, "A", "R2",
     "TR", 99.9, 99, 0, "A", "-", 0, 0, "<LOD"],
]  # fmt: skip


def test_extract_picks_the_value_columns(tmp_path: Path) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADERS)
    for row in ROWS:
        sheet.append(row)
    xlsx = tmp_path / "bls.xlsx"
    workbook.save(xlsx)
    target = tmp_path / "out" / "extract.csv"

    assert extract(xlsx, target) == 2

    with target.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == FIELDS
        rows = list(reader)
    assert rows[0] == {
        "code": "X100000",
        "name": "Testapfel roh",
        "kcal": "52",
        "protein": "0.3",
        "carbs": "12.4",
        "fat": "0.2",
        "fiber": "2.3",
        "sugar": "10.1",
        "sat_fat": "0.04",
        "salt": "0.002",
    }
    assert (rows[1]["protein"], rows[1]["carbs"], rows[1]["fiber"], rows[1]["sat_fat"]) == (
        "TR",
        "0",
        "-",
        "<LOD",
    )
