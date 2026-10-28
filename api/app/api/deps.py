"""FastAPI dependencies.

Tests override get_db with their rolled-back session, get_now, get_off and
get_label_extractor.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.labels.agent import AgentLabelExtractor
from app.labels.extractor import FakeLabelExtractor, LabelExtractor
from app.sources.off import OpenFoodFacts


def get_db() -> Iterator[Session]:
    with get_session() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]


def get_now() -> datetime:
    """The current moment; tests override it to fix the clock."""
    return datetime.now(UTC)


NowDep = Annotated[datetime, Depends(get_now)]


@lru_cache
def get_off() -> OpenFoodFacts:
    """One client per process, so the local rate limit counts every request."""
    return OpenFoodFacts(get_settings().off_base_url)


OffDep = Annotated[OpenFoodFacts, Depends(get_off)]


def get_label_extractor() -> LabelExtractor:
    """The Agent SDK; with LABEL_EXTRACTOR=fake an invented draft without any model."""
    kind = get_settings().label_extractor
    if kind == "fake":
        return FakeLabelExtractor()
    if kind == "agent":
        return AgentLabelExtractor()
    raise ValueError(f"LABEL_EXTRACTOR {kind!r} is neither agent nor fake")


LabelExtractorDep = Annotated[LabelExtractor, Depends(get_label_extractor)]
