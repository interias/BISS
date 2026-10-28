"""GTIN normalisation (SPEC 6): EAN-8, UPC-A, EAN-13 and GTIN-14 become GTIN-14."""

# Lengths of the GTIN family: EAN-8, UPC-A, EAN-13, GTIN-14.
LENGTHS = (8, 12, 13, 14)


class InvalidGtin(ValueError):
    pass


def check_digit(body: str) -> str:
    """GS1 check digit of the digits before it: weights 3 and 1 from the right."""
    total = sum(int(digit) * (3 if i % 2 == 0 else 1) for i, digit in enumerate(reversed(body)))
    return str(-total % 10)


def normalize_gtin(code: str) -> str:
    """The 14-digit GTIN with leading zeros; a wrong length or check digit is invalid."""
    code = code.strip()
    if not (code.isascii() and code.isdigit()) or len(code) not in LENGTHS:
        raise InvalidGtin(f"{code!r} is no EAN-8, UPC-A, EAN-13 or GTIN-14")
    if check_digit(code[:-1]) != code[-1]:
        raise InvalidGtin(f"{code!r} has a wrong check digit")
    return code.zfill(14)


def off_code(gtin: str) -> str:
    """The barcode as Open Food Facts stores it: no leading zeros, EAN-8 or at least 13 digits."""
    code = gtin.lstrip("0")
    return code.zfill(8) if len(code) <= 8 else code.zfill(13)
