"""FastAPI dependencies.

Tests override get_db with their rolled-back session, get_now, get_off,
get_label_extractor and get_plate_extractor.
"""

from collections.abc import Iterator
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.domain.stats import check_period
from app.labels.agent import AgentLabelExtractor
from app.labels.extractor import FakeLabelExtractor, LabelExtractor
from app.plates.agent import AgentPlateExtractor
from app.plates.extractor import FakePlateExtractor, PlateExtractor
from app.sources.off import OpenFoodFacts


def get_db() -> Iterator[Session]:
    with get_session() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]


def get_now() -> datetime:
    """The current moment; tests override it to fix the clock."""
    return datetime.now(UTC)


NowDep = Annotated[datetime, Depends(get_now)]


def get_period(
    start: Annotated[date, Query(alias="from")], end: Annotated[date, Query(alias="to")]
) -> tuple[date, date]:
    """The period `from`..`to`, both included, of 1 to 366 days."""
    try:
        check_period(start, end)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return start, end


PeriodDep = Annotated[tuple[date, date], Depends(get_period)]


@lru_cache
def get_off() -> OpenFoodFacts:
    """One client per process, so the local rate limits count every request."""
    settings = get_settings()
    return OpenFoodFacts(settings.off_base_url, search_url=settings.off_search_url)


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


def get_plate_extractor() -> PlateExtractor:
    """The Agent SDK; with PLATE_EXTRACTOR=fake an invented plate without any model."""
    kind = get_settings().plate_extractor
    if kind == "fake":
        return FakePlateExtractor()
    if kind == "agent":
        return AgentPlateExtractor()
    raise ValueError(f"PLATE_EXTRACTOR {kind!r} is neither agent nor fake")


PlateExtractorDep = Annotated[PlateExtractor, Depends(get_plate_extractor)]
