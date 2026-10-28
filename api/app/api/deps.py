"""FastAPI dependencies.

Tests override get_db with their rolled-back session, get_now and get_off.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
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
