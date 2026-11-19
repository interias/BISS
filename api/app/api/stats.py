from fastapi import APIRouter

from app.api import convert, schemas
from app.api.deps import NowDep, PeriodDep, SessionDep
from app.domain.day import day_of
from app.services.stats import period_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def get_stats(period: PeriodDep, session: SessionDep, now: NowDep) -> schemas.Stats:
    """Statistik of `from`..`to` (SPEC 4): only days before today with entries count."""
    return convert.stats(period_stats(session, *period, today=day_of(now)))
