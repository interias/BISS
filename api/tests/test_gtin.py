import pytest

from app.barcode.gtin import InvalidGtin, check_digit, normalize_gtin, off_code


@pytest.mark.parametrize(
    ("code", "gtin"),
    [
        ("20000011", "00000020000011"),  # EAN-8
        ("200000000011", "00200000000011"),  # UPC-A
        ("0200000000011", "00200000000011"),  # the same UPC-A as EAN-13
        ("2000000000015", "02000000000015"),  # EAN-13
        ("02000000000015", "02000000000015"),  # already GTIN-14
        ("12000000000012", "12000000000012"),  # GTIN-14 with packaging indicator
        (" 2000000000015 ", "02000000000015"),
    ],
)
def test_codes_become_gtin_14_with_leading_zeros(code: str, gtin: str) -> None:
    assert normalize_gtin(code) == gtin


@pytest.mark.parametrize(
    "code",
    [
        "2000000000016",  # wrong check digit
        "20000012",
        "200000000012",
        "",
        "1234567",  # 7 digits
        "123456789",  # 9 digits
        "200000000001500",  # 15 digits
        "20000000000l5",
        "２０００００１１",  # full-width digits
    ],
)
def test_invalid_codes_are_rejected(code: str) -> None:
    with pytest.raises(InvalidGtin):
        normalize_gtin(code)


def test_check_digit() -> None:
    assert check_digit("400638133393") == "1"  # 4006381333931, the GS1 example
    assert check_digit("9638507") == "4"  # 96385074
    assert check_digit("000000000000") == "0"


@pytest.mark.parametrize(
    ("gtin", "code"),
    [
        ("00000020000011", "20000011"),
        ("00200000000011", "0200000000011"),
        ("02000000000015", "2000000000015"),
        ("12000000000012", "12000000000012"),
    ],
)
def test_off_code_drops_leading_zeros_down_to_ean_8_or_13(gtin: str, code: str) -> None:
    assert off_code(gtin) == code
