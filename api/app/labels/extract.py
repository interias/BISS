"""Extraction with fallback (SPEC 7): the fast model first, at a rule violation once the strong."""

from dataclasses import dataclass

from app.labels.draft import LabelDraft
from app.labels.extractor import ExtractionFailed, LabelExtractor
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
    If the strong model gives no usable draft, the fast model's draft stays, with its
    violations: the editor shows the warning (SPEC 7) instead of losing what was read (#25).
    """
    draft = await extractor.extract(photo, fast)
    result = check(draft.per_100)
    if result.ok:
        return Extraction(draft, result, fast, 1)
    try:
        strong_draft = await extractor.extract(photo, strong)
    except ExtractionFailed:
        return Extraction(draft, result, fast, 2)
    return Extraction(strong_draft, check(strong_draft.per_100), strong, 2)
