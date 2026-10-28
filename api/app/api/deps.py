"""FastAPI dependencies. Tests override get_db with their rolled-back session."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db import get_session


def get_db() -> Iterator[Session]:
    with get_session() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
