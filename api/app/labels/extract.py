"""Extraction with fallback (SPEC 7): the fast model first, at a rule violation once the strong."""

from dataclasses import dataclass

from app.labels.draft import LabelDraft
from app.labels.extractor import LabelExtractor
from app.labels.validation import Check, check


@dataclass(frozen=True)
class Extraction:
    draft: LabelDraft
    check: Check
    # The model whose draft is returned, and how many models were asked (1 or 2).
    model: str
    attempts: int


async def extract_label(
    extractor: LabelExtractor, photo: bytes, fast: str, strong: str
) -> Extraction:
    """Draft of the fast model; with a violation exactly one second try with the strong one.

    If the violation stays, the strong model's draft is returned with its violations.
    """
    draft = await extractor.extract(photo, fast)
    result = check(draft.per_100)
    if result.ok:
        return Extraction(draft, result, fast, 1)
    draft = await extractor.extract(photo, strong)
    return Extraction(draft, check(draft.per_100), strong, 2)
