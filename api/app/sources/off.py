"""Open Food Facts adapter (ADR-0002): one product per barcode from API v2, as a food draft.

Only the barcode lookup; no text search, no dump, nothing is written to Open Food Facts.
"""

import logging
import math
import re
import threading
import time
import tomllib
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.barcode.gtin import off_code

SOURCE = "off"
# The api project is no installed package, so its version is read from pyproject.toml.
VERSION = tomllib.loads(
    (Path(__file__).resolve().parents[2] / "pyproject.toml").read_text(encoding="utf-8")
)["project"]["version"]
USER_AGENT = f"BISS/{VERSION} (github.com/interias/BISS)"
TIMEOUT_SECONDS = 2.0
# Local limit (ADR-0002), counted over all requests of the process.
MAX_REQUESTS = 15
WINDOW_SECONDS = 60.0

NUTRIMENTS = {
    "kcal": "energy-kcal_100g",
    "protein": "proteins_100g",
    "carbs": "carbohydrates_100g",
    "fat": "fat_100g",
    "fiber": "fiber_100g",
    "sugar": "sugars_100g",
    "sat_fat": "saturated-fat_100g",
    "salt": "salt_100g",
}
CORE = ("kcal", "protein", "carbs", "fat")
KJ_PER_KCAL = 4.184
FIELDS = (
    "code",
    "product_name",
    "product_name_de",
    "brands",
    "product_quantity_unit",
    "serving_size",
    "serving_quantity",
    "nutriments",
)

log = logging.getLogger(__name__)


class RateLimit:
    """At most `limit` requests in a sliding window, shared by all threads of the process."""

    def __init__(
        self,
        limit: int = MAX_REQUESTS,
        window: float = WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit, self.window, self.clock = limit, window, clock
        self._requests: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> bool:
        """Count a request if the window has room; False means do not send it."""
        with self._lock:
            now = self.clock()
            while self._requests and self._requests[0] <= now - self.window:
                self._requests.popleft()
            if len(self._requests) >= self.limit:
                return False
            self._requests.append(now)
            return True


class OpenFoodFacts:
    def __init__(self, base_url: str, rate_limit: RateLimit | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.rate_limit = rate_limit or RateLimit()

    def product(self, gtin: str) -> dict[str, Any] | None:
        """The API answer for a found product.

        None when there is none, on a timeout, an error status (also 429) or when the local
        limit is reached: the barcode chain then ends without a hit.
        """
        if not self.rate_limit.acquire():
            log.warning("open food facts: local limit reached, %s not requested", gtin)
            return None
        try:
            response = httpx.get(
                f"{self.base_url}/api/v2/product/{off_code(gtin)}",
                params={"fields": ",".join(FIELDS)},
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            log.warning("open food facts: %s for %s", type(error).__name__, gtin)
            return None
        if response.status_code != 200:
            # 404 is an unknown product; 429 and 5xx are no hit either.
            if response.status_code != 404:
                log.warning("open food facts: status %s for %s", response.status_code, gtin)
            return None
        try:
            body = response.json()
        except ValueError:
            return None
        # An unknown product is answered with 200, status 0 and no product.
        if not isinstance(body, dict) or body.get("status") != 1:
            return None
        if not isinstance(body.get("product"), dict):
            return None
        return body


@dataclass(frozen=True)
class ServingDraft:
    label: str
    grams: float


@dataclass(frozen=True)
class FoodDraft:
    """A food as Open Food Facts describes it; stored only on its first entry (SPEC 4)."""

    gtin: str
    source_id: str
    name: str
    brand: str | None
    basis: str
    values: dict[str, float | None]
    # serving_size of the package, the standard serving (ADR-0002).
    serving: ServingDraft | None


def draft(gtin: str, payload: dict[str, Any]) -> FoodDraft | None:
    """Map an API answer onto a draft; None without a name or an energy value."""
    product = payload["product"]
    name = _text(product.get("product_name_de")) or _text(product.get("product_name"))
    nutriments = product.get("nutriments")
    nutriments = nutriments if isinstance(nutriments, dict) else {}
    values = {field: _number(nutriments.get(key)) for field, key in NUTRIMENTS.items()}
    if values["kcal"] is None and (kj := _number(nutriments.get("energy-kj_100g"))) is not None:
        values["kcal"] = round(kj / KJ_PER_KCAL, 1)
    if not name or values["kcal"] is None:
        return None
    # Core values are required; a missing one counts as 0, as in the BLS import.
    for field in CORE:
        if values[field] is None:
            values[field] = 0.0
    brands = [brand.strip() for brand in (_text(product.get("brands")) or "").split(",")]
    return FoodDraft(
        gtin=gtin,
        source_id=_text(payload.get("code")) or off_code(gtin),
        name=name,
        brand=next((brand for brand in brands if brand), None),
        basis="ml" if product.get("product_quantity_unit") == "ml" else "g",
        values=values,
        serving=_serving(product),
    )


SERVING_AMOUNT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b", re.IGNORECASE)


def _serving(product: dict[str, Any]) -> ServingDraft | None:
    """The package serving from serving_size, e.g. "15 g" or "1 Riegel (40 g)".

    serving_quantity is the amount in g or ml; with the density of 1.0 both are grams.
    """
    label = _text(product.get("serving_size"))
    if not label:
        return None
    grams = _number(product.get("serving_quantity"))
    if grams is None and (match := SERVING_AMOUNT.search(label)):
        grams = _number(match.group(1))
    if not grams:
        return None
    return ServingDraft(label=label, grams=grams)


def _text(value: Any) -> str | None:
    return (value.strip() or None) if isinstance(value, str) else None


def _number(value: Any) -> float | None:
    """A non-negative number from a JSON number or a string like "15" or "1,5"."""
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.strip().replace(",", ".")
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None
