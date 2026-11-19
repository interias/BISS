from fastapi import APIRouter

from app.api import schemas
from app.api.deps import SessionDep
from app.services import settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(session: SessionDep) -> schemas.Settings:
    return schemas.Settings(tolerance=settings.tolerance(session))


@router.put("")
def put_settings(body: schemas.SettingsIn, session: SessionDep) -> schemas.Settings:
    """Set the tolerance of the Zielbereich, 0.05 to 0.20; it applies to every day."""
    return schemas.Settings(tolerance=settings.set_tolerance(session, body.tolerance))
