"""Draw the fixture labels and their expected values (invented products, no OFF data).

The two labels hold the three typical mistakes of SPEC 7: a pudding powder with the columns
unprepared, prepared and per serving, and an oat drink per 100 ml and per glass.

Pillow's bundled font has no umlauts, so the regular and bold TTF of a font that has them
(DejaVu Sans, for example) are passed as arguments:

    docker compose run --rm --no-deps -v "<font dir>:/fonts:ro" api uv run python
        tests/fixtures/labels/make_labels.py /fonts/DejaVuSans.ttf /fonts/DejaVuSans-Bold.ttf
"""

import sys
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent

ROWS = [
    ("Energie", "energy"),
    ("Fett", "fat"),
    ("davon gesättigte Fettsäuren", "saturated_fat"),
    ("Kohlenhydrate", "carbs"),
    ("davon Zucker", "sugar"),
    ("Ballaststoffe", "fiber"),
    ("Eiweiß", "protein"),
    ("Salz", "salt"),
]

LABELS = [
    {
        "file": "pudding_powder.png",
        "brand": "Hofgut Lindental",
        "name": "Schoko-Pudding Pulver",
        "quantity": "3 × 46 g",
        "unit": "g",
        "headers": ["je 100 g\nunzubereitet", "je 100 g\nzubereitet¹", "je Portion¹\n(125 g)"],
        "columns": [
            {
                "energy": (1512, 361),
                "fat": 2.5,
                "saturated_fat": 1.5,
                "carbs": 76.0,
                "sugar": 45.0,
                "fiber": 6.0,
                "protein": 6.5,
                "salt": 0.30,
            },
            {
                "energy": (402, 96),
                "fat": 1.6,
                "saturated_fat": 1.0,
                "carbs": 16.0,
                "sugar": 12.0,
                "fiber": 0.8,
                "protein": 3.9,
                "salt": 0.12,
            },
            {
                "energy": (502, 120),
                "fat": 2.0,
                "saturated_fat": 1.3,
                "carbs": 20.0,
                "sugar": 15.0,
                "fiber": 1.0,
                "protein": 4.9,
                "salt": 0.15,
            },
        ],
        "footnote": "¹ zubereitet mit 250 ml fettarmer Milch (1,5 % Fett) je Beutel",
        "expected": {"basis": "g", "state": "as_sold", "column": 0},
    },
    {
        "file": "oat_drink.png",
        "brand": "Nordfeld",
        "name": "Hafer-Drink Barista",
        "quantity": "1 l",
        "unit": "ml",
        "headers": ["je 100 ml", "je Glas\n(250 ml)"],
        "columns": [
            {
                "energy": (251, 60),
                "fat": 3.0,
                "saturated_fat": 0.3,
                "carbs": 6.6,
                "sugar": 3.3,
                "fiber": 0.8,
                "protein": 1.0,
                "salt": 0.10,
            },
            {
                "energy": (628, 150),
                "fat": 7.5,
                "saturated_fat": 0.8,
                "carbs": 16.5,
                "sugar": 8.3,
                "fiber": 2.0,
                "protein": 2.5,
                "salt": 0.25,
            },
        ],
        "footnote": "Vor Gebrauch schütteln. Nach dem Öffnen gekühlt 5 Tage haltbar.",
        "expected": {"basis": "ml", "state": "as_sold", "column": 0},
    },
]


FONTS: dict[bool, str] = {}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONTS[bold], size)


def number(value: float) -> str:
    text = f"{value:.2f}" if value < 1 else f"{value:.1f}"
    return text.replace(".", ",")


def cell(key: str, column: dict) -> str:
    if key == "energy":
        kj, kcal = column["energy"]
        return f"{kj} kJ /\n{kcal} kcal"
    return f"{number(column[key])} g"


def draw(label: dict) -> Image.Image:
    first, other = 430, 230
    width = first + other * len(label["headers"]) + 60
    height = 1020
    card = Image.new("RGB", (width, height), (250, 248, 242))
    pen = ImageDraw.Draw(card)
    pen.text((30, 24), label["brand"], fill=(90, 90, 90), font=font(30))
    pen.text((30, 64), label["name"], fill=(20, 20, 20), font=font(46, bold=True))
    pen.text((30, 124), f"Inhalt: {label['quantity']}", fill=(40, 40, 40), font=font(28))

    top, left, right = 190, 30, width - 30
    pen.rectangle((left, top, right, height - 110), outline=(0, 0, 0), width=3)
    pen.text((left + 14, top + 16), "Nährwerte", fill=(0, 0, 0), font=font(32, bold=True))
    for i, header in enumerate(label["headers"]):
        pen.multiline_text(
            (left + first + i * other, top + 14), header, fill=(0, 0, 0), font=font(26)
        )
    y = top + 96
    pen.line((left, y, right, y), fill=(0, 0, 0), width=3)
    for title, key in ROWS:
        tall = key == "energy"
        pen.text((left + 14, y + 14), title, fill=(0, 0, 0), font=font(28))
        for i, column in enumerate(label["columns"]):
            pen.multiline_text(
                (left + first + i * other, y + 14),
                cell(key, column),
                fill=(0, 0, 0),
                font=font(28),
            )
        y += 96 if tall else 62
        pen.line((left, y, right, y), fill=(0, 0, 0), width=1)
    pen.text((30, height - 90), label["footnote"], fill=(40, 40, 40), font=font(22))

    # A photo, not a scan: slightly turned on a grey table.
    photo = card.rotate(
        2.5, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(120, 124, 128)
    )
    return photo


def expected(label: dict) -> dict:
    column = label["columns"][label["expected"]["column"]]
    kj, kcal = column["energy"]
    values = {key: column[key] for _, key in ROWS if key != "energy"}
    return {
        "brand": label["brand"],
        "name": label["name"],
        "basis": label["expected"]["basis"],
        "state": label["expected"]["state"],
        "per_100": {"energy_kj": kj, "energy_kcal": kcal, **values},
    }


def main() -> None:
    FONTS[False], FONTS[True] = sys.argv[1], sys.argv[2]
    out = {}
    for label in LABELS:
        draw(label).save(HERE / label["file"])
        out[label["file"]] = expected(label)
    text = "# Written by make_labels.py; the values the llm test expects per label.\n"
    text += yaml.safe_dump(out, allow_unicode=True, sort_keys=False)
    (HERE / "expected.yaml").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
