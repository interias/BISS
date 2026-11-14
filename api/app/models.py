"""ORM models. The schema, including constraints and indexes, is owned by Alembic.

The migrations are written by hand, so `alembic check` reports their indexes and
constraints as removed; it is no drift check here.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    Date,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
    Uuid,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, column_property, mapped_column


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
    # Symbol group for a food without a photo (app.domain.category); null shows "other".
    category: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(Text)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    overridden: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    name_norm: Mapped[str] = mapped_column(Text, Computed("biss_normalize(name)", persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def scanned(self) -> bool:
        """A product with a barcode, from a scan or a label photo; the app sets it apart."""
        return self.gtin is not None


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
    # The entries of one plate share group_id and group_name (SPEC 7a); null for others.
    group_id: Mapped[UUID | None] = mapped_column(Uuid)
    group_name: Mapped[str | None] = mapped_column(Text)


class Combo(Base):
    """Schnellzugriff: a named template of foods with grams (ADR-0010), not an entry."""

    __tablename__ = "combo"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ComboItem(Base):
    __tablename__ = "combo_item"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    combo_id: Mapped[int] = mapped_column(ForeignKey("combo.id", ondelete="CASCADE"))
    food_id: Mapped[int] = mapped_column(ForeignKey("food.id"))
    grams: Mapped[float] = mapped_column(Double)
    position: Mapped[int] = mapped_column(Integer, server_default="0")


class Recipe(Base):
    """Rezept: an own dish made from foods (ADR-0012). Its food carries the values per
    100 g of the finished dish and the serving "1 Portion"."""

    __tablename__ = "recipe"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    food_id: Mapped[int] = mapped_column(ForeignKey("food.id"), unique=True)
    description: Mapped[str] = mapped_column(Text, server_default="")
    portions: Mapped[int] = mapped_column(Integer, server_default="1")
    # The weighed finished dish; null: not weighed, the sum of the ingredients applies.
    cooked_grams: Mapped[float | None] = mapped_column(Double)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RecipeItem(Base):
    __tablename__ = "recipe_item"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipe.id", ondelete="CASCADE"))
    food_id: Mapped[int] = mapped_column(ForeignKey("food.id"))
    grams: Mapped[float] = mapped_column(Double)
    position: Mapped[int] = mapped_column(Integer, server_default="0")


# Whether a food is the food of a recipe; loaded with the food, so every answer that names
# a food can set recipes apart.
Food.recipe = column_property(
    select(func.count(Recipe.id) > 0)
    .where(Recipe.food_id == Food.id)
    .correlate_except(Recipe)
    .scalar_subquery()
)


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
