"""Search normalisation in Python, character for character the same as biss_normalize().

The SQL function in migration 0001 fills food.name_norm; search queries are normalised
here before they reach pg_trgm (SPEC 6). The steps follow the SQL function:
umlauts -> unaccent -> lower case -> drop quantities -> non-alphanumerics to spaces -> trim.

Known gap: whether a character is a word character for the quantity boundaries comes from
the database's libc. For Latin, Greek and Cyrillic letters, punctuation and symbols the
rule below matches it; about 600 rarer code points (combining marks of other scripts,
circled letters, Latin letters newer than Unicode 13) differ, which only matters directly
next to a quantity.
"""

import re
import unicodedata

from app.search.unaccent_table import UNACCENT

_UMLAUTS = str.maketrans(
    {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"}
)
_UNACCENT = str.maketrans(UNACCENT)

# Postgres regex classes as the database sees them: \d is ASCII only, \s is Python's
# white space without U+001C-U+001F, U+00A0, U+1680, U+2007 and U+202F.
_SPACE = "[\t\n\v\f\r \x85 -  -    　]"
# Lookahead, so that overlapping candidates are found; word boundaries are checked below.
_QUANTITY = re.compile(rf"(?=([0-9]+(?:[.,][0-9]+)?{_SPACE}*(?:mg|g|kg|ml|cl|dl|l)))")
# Word characters for \m and \M: letters, decimal and letter numbers, combining marks and
# "_". Other numbers such as "²" or "½" are no word characters in the database.
_WORD_CATEGORIES = {"Lu", "Ll", "Lt", "Lm", "Lo", "Nd", "Nl", "Mn", "Mc"}
_SEPARATORS = re.compile(r"[^a-z0-9]+")


def _is_word(char: str) -> bool:
    return char == "_" or unicodedata.category(char) in _WORD_CATEGORIES


def _drop_quantities(value: str) -> str:
    """Replace quantities like "500 g" or "1,5 l" that stand as words by a space."""
    parts, last = [], 0
    for match in _QUANTITY.finditer(value):
        start, end = match.start(), match.end(1)
        if start < last or (start > 0 and _is_word(value[start - 1])):
            continue
        if end < len(value) and _is_word(value[end]):
            continue
        parts += [value[last:start], " "]
        last = end
    return "".join(parts) + value[last:]


def normalize(value: str) -> str:
    """Normalise a food name or a search query like the generated column name_norm.

    The input is brought into NFC first; otherwise a decomposed umlaut would turn into
    "a" instead of "ae". Names written to the database must be NFC for the same reason.
    """
    value = unicodedata.normalize("NFC", value)
    value = value.translate(_UMLAUTS).translate(_UNACCENT).lower()
    return _SEPARATORS.sub(" ", _drop_quantities(value)).strip(" ")
