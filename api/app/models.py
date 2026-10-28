"""ORM models. The schema, including constraints and indexes, is owned by Alembic.

The migrations are written by hand, so `alembic check` reports their indexes and
constraints as removed; it is no drift check here.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    Date,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Food(Base):
    __tablename__ = "food"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(Text)
    gtin: Mapped[str | None] = mapped_column(String(14), unique=True)
    basis: Mapped[str] = mapped_column(Text, server_default="g")
    density: Mapped[float] = mapped_column(Double, server_default="1.0")
    kcal: Mapped[float] = mapped_column(Double)
    protein: Mapped[float] = mapped_column(Double)
    carbs: Mapped[float] = mapped_column(Double)
    fat: Mapped[float] = mapped_column(Double)
    fiber: Mapped[float | None] = mapped_column(Double)
    sugar: Mapped[float | None] = mapped_column(Double)
    sat_fat: Mapped[float | None] = mapped_column(Double)
    salt: Mapped[float | None] = mapped_column(Double)
    image_path: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    overridden: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    name_norm: Mapped[str] = mapped_column(Text, Computed("biss_normalize(name)", persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FoodSourceData(Base):
    __tablename__ = "food_source_data"

    food_id: Mapped[int] = mapped_column(
        ForeignKey("food.id", ondelete="CASCADE"), primary_key=True
    )
    source: Mapped[str] = mapped_column(Text, primary_key=True)
    source_id: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Serving(Base):
    __tablename__ = "serving"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("food.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(Text)
    grams: Mapped[float] = mapped_column(Double)
    origin: Mapped[str] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, server_default="false")


class Entry(Base):
    __tablename__ = "entry"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("food.id"))
    grams: Mapped[float] = mapped_column(Double)
    meal: Mapped[str] = mapped_column(Text)
    eaten_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    day: Mapped[date] = mapped_column(Date)
    kcal: Mapped[float] = mapped_column(Double)
    protein: Mapped[float] = mapped_column(Double)
    carbs: Mapped[float] = mapped_column(Double)
    fat: Mapped[float] = mapped_column(Double)


class Goal(Base):
    __tablename__ = "goal"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    day: Mapped[date | None] = mapped_column(Date)
    kcal: Mapped[float] = mapped_column(Double)
    protein: Mapped[float] = mapped_column(Double)
    carbs: Mapped[float] = mapped_column(Double)
    fat: Mapped[float] = mapped_column(Double)


# Name and brand of the payload as off.draft() reads them, normalised (migration 0003).
_OFF_NAME_NORM = r"""biss_normalize(CASE
    WHEN jsonb_typeof(payload #> '{product,product_name_de}') = 'string'
         AND payload #>> '{product,product_name_de}' ~ '\S'
    THEN payload #>> '{product,product_name_de}'
    WHEN jsonb_typeof(payload #> '{product,product_name}') = 'string'
         AND payload #>> '{product,product_name}' ~ '\S'
    THEN payload #>> '{product,product_name}' END)"""
_OFF_BRAND_NORM = r"""biss_normalize(substring(CASE
    WHEN jsonb_typeof(payload #> '{product,brands}') = 'string'
    THEN payload #>> '{product,brands}' END FROM '[^,]*[^,\s][^,]*'))"""


class OffCache(Base):
    """Open Food Facts products shown after a scan, valid for 30 days (SPEC 4).

    The search finds them by name_norm (trigram index) and brand_norm (SPEC 6).
    """

    __tablename__ = "off_cache"

    gtin: Mapped[str] = mapped_column(String(14), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    name_norm: Mapped[str | None] = mapped_column(Text, Computed(_OFF_NAME_NORM, persisted=True))
    brand_norm: Mapped[str | None] = mapped_column(Text, Computed(_OFF_BRAND_NORM, persisted=True))
