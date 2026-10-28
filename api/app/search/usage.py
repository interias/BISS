"""The usage measure of a food, shared by the search ranking and /recent (SPEC 5, 6)."""

from datetime import UTC, datetime

from app.search.weights import RANKING, RankingConfig

# One row per used food: usage = sum over its entries of 0.5 ^ (age in days / half-life).
# Entries dated after :now count as new. Bind the parameters with usage_params().
USAGE_BY_FOOD = """
    SELECT e.food_id,
           sum(power(0.5, greatest(
               extract(epoch FROM CAST(:now AS timestamptz) - e.eaten_at) / 86400.0, 0
           ) / :half_life)) AS usage,
           max(e.eaten_at) AS last_eaten,
           max(e.id) AS last_id
    FROM entry e
    GROUP BY e.food_id
"""


def usage_params(now: datetime | None = None, config: RankingConfig = RANKING) -> dict:
    return {"now": now or datetime.now(UTC), "half_life": config.usage_half_life_days}
