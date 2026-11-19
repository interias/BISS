"""Settings: the single setting row, for now the tolerance of the Zielbereich (ADR-0015)."""

from sqlalchemy.orm import Session

from app.models import Setting

DEFAULT_TOLERANCE = 0.10
MIN_TOLERANCE = 0.05
MAX_TOLERANCE = 0.20


def _row(session: Session) -> Setting:
    """The row the migration inserts; created should it be missing."""
    row = session.get(Setting, 1)
    if row is None:
        row = Setting(id=1, tolerance=DEFAULT_TOLERANCE)
        session.add(row)
        session.flush()
    return row


def tolerance(session: Session) -> float:
    return _row(session).tolerance


def set_tolerance(session: Session, value: float) -> float:
    """Store the tolerance; the caller checks it lies within the bounds."""
    _row(session).tolerance = value
    session.commit()
    return value
